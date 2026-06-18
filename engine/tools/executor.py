import time
import logging
from datetime import datetime, timezone

import anthropic

from models import AgentConfig, TraceStep, RunResult

logger = logging.getLogger(__name__)

# What each personality adds to the system prompt
PERSONALITY_ADDITIONS = {
    "professional": "Maintain a precise, formal, and thorough communication style. Structure your responses clearly with logical flow.",
    "friendly":     "Be warm, encouraging, and conversational. Use approachable language and be supportive.",
    "concise":      "Be extremely brief and direct. Use as few words as possible. Get straight to the point with no filler.",
    "creative":     "Think imaginatively. Use vivid language, interesting examples, and fresh perspectives.",
}

MAX_ITERATIONS  = 10      # Maximum tool-use loops before we stop
TIMEOUT_SECONDS = 60      # Hard timeout for the entire run


class AgentExecutor:
    """
    Runs an AI agent using a ReAct (Reason + Act) loop.

    Flow for every run:
      1. Build the full system prompt from the agent config + personality.
      2. Get tool definitions for only the tools the agent has enabled.
      3. Call Claude. If Claude returns a tool_use block, run that tool and
         send the result back to Claude. Repeat up to MAX_ITERATIONS times.
      4. When Claude returns end_turn with no tool calls, that is the final answer.
      5. Return a RunResult with the answer, full trace, token count, and duration.
    """

    def __init__(self):
        self.client   = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY from env
        from tools.registry import ToolRegistry        # imported here to avoid circular imports
        self.registry = ToolRegistry()

    # ------------------------------------------------------------------ helpers

    def _now_iso(self) -> str:
        """Current UTC time as an ISO-8601 string."""
        return datetime.now(timezone.utc).isoformat()

    def _ms_since(self, start: float) -> int:
        """Milliseconds elapsed since a time.time() snapshot."""
        return int((time.time() - start) * 1000)

    def _build_system_prompt(self, config: AgentConfig) -> str:
        """
        Combine the user-written system prompt with the personality instruction.
        Filters out empty strings so we never send double newlines.
        """
        personality_note = PERSONALITY_ADDITIONS.get(config.personality, "")
        parts = [config.system_prompt.strip(), personality_note]
        return "\n\n".join(p for p in parts if p)

    # ------------------------------------------------------------------ main

    def run(self, agent_config: AgentConfig, user_message: str) -> RunResult:
        """
        Execute one agent run and return the full result.

        Args:
            agent_config: The agent's configuration (model, tools, prompt, etc.)
            user_message: The message the user typed into the run panel.

        Returns:
            RunResult containing the final answer, step-by-step trace,
            token count, duration, and status.
        """
        run_start    = time.time()
        trace:  list[TraceStep] = []
        step_num     = 0
        tokens_total = 0
        final_answer = ""

        logger.info(
            f"[RUN {agent_config.id}] Starting — agent: '{agent_config.name}' "
            f"| model: {agent_config.model} "
            f"| tools: {agent_config.enabled_tool_slugs}"
        )

        # Build the system prompt and collect tool definitions
        system_prompt    = self._build_system_prompt(agent_config)
        tool_definitions = self.registry.get_definitions(agent_config.enabled_tool_slugs)

        # Conversation history — starts with just the user's message
        messages = [{"role": "user", "content": user_message}]

        # ---------------------------------------------------------------- loop
        for iteration in range(MAX_ITERATIONS):

            # Hard timeout check at the top of every loop
            if self._ms_since(run_start) > TIMEOUT_SECONDS * 1000:
                logger.warning(f"[RUN {agent_config.id}] Timeout at iteration {iteration}")
                return RunResult(
                    final_answer = final_answer,
                    run_trace    = trace,
                    tokens_used  = tokens_total,
                    duration_ms  = self._ms_since(run_start),
                    status       = "timeout",
                    error_message= "Execution exceeded 60 second limit",
                )

            iter_start = time.time()
            logger.info(f"[RUN {agent_config.id}] Iteration {iteration + 1} — calling Claude")

            # ---------- build the API call ----------
            api_kwargs: dict = {
                "model":      agent_config.model,
                "max_tokens": agent_config.max_tokens,
                "system":     system_prompt,
                "messages":   messages,
            }
            # temperature is optional in some contexts (reasoning models ignore it)
            if agent_config.temperature is not None:
                api_kwargs["temperature"] = agent_config.temperature
            # Only add tools key if the agent has tools enabled; sending an
            # empty list causes a Claude API validation error.
            if tool_definitions:
                api_kwargs["tools"] = tool_definitions

            # ---------- call Claude ----------
            try:
                response = self.client.messages.create(**api_kwargs)
            except anthropic.APIError as exc:
                # API-level error (auth, rate limit, model not found, etc.)
                step_num += 1
                trace.append(TraceStep(
                    step_number = step_num,
                    type        = "error",
                    content     = f"Claude API error: {str(exc)}",
                    timestamp   = self._now_iso(),
                    duration_ms = self._ms_since(iter_start),
                ))
                logger.error(f"[RUN {agent_config.id}] API error: {exc}")
                return RunResult(
                    final_answer = final_answer,
                    run_trace    = trace,
                    tokens_used  = tokens_total,
                    duration_ms  = self._ms_since(run_start),
                    status       = "failed",
                    error_message= str(exc),
                )

            # Track token usage
            tokens_total += response.usage.input_tokens + response.usage.output_tokens
            logger.info(
                f"[RUN {agent_config.id}] Iteration {iteration + 1} — "
                f"stop_reason={response.stop_reason} | "
                f"tokens={response.usage.input_tokens}+{response.usage.output_tokens}"
            )

            # ---------- process the content blocks ----------
            has_tool_use = False
            tool_results = []

            for block in response.content:

                # ---- text block: Claude's reasoning / final answer ----
                if block.type == "text":
                    text = block.text.strip()
                    if not text:
                        continue                        # skip blank text blocks

                    step_num += 1
                    trace.append(TraceStep(
                        step_number = step_num,
                        type        = "thinking",
                        content     = text,
                        timestamp   = self._now_iso(),
                        duration_ms = self._ms_since(iter_start),
                    ))
                    final_answer = text                 # keep updating — last text = answer
                    logger.info(
                        f"[RUN {agent_config.id}] step {step_num}: thinking — "
                        f"{text[:100]}{'...' if len(text) > 100 else ''}"
                    )

                # ---- tool_use block: Claude wants to call a tool ----
                elif block.type == "tool_use":
                    has_tool_use = True
                    tool_start   = time.time()
                    step_num    += 1

                    # Log the tool call before executing it
                    trace.append(TraceStep(
                        step_number = step_num,
                        type        = "tool_call",
                        content     = f"Calling {block.name} with: {str(block.input)[:300]}",
                        tool_name   = block.name,
                        tool_input  = dict(block.input),
                        timestamp   = self._now_iso(),
                        duration_ms = 0,                # will update in result step
                    ))
                    logger.info(
                        f"[RUN {agent_config.id}] step {step_num}: tool_call — "
                        f"{block.name}({block.input})"
                    )

                    # --- execute the tool ---
                    try:
                        tool = self.registry.get_tool(block.name)
                        if tool is None:
                            raise ValueError(
                                f"Tool '{block.name}' is not registered. "
                                f"Available tools: {list(self.registry._tools.keys())}"
                            )
                        # Pass all input fields as keyword arguments
                        tool_output = tool.run(**block.input)
                        is_error    = False
                    except Exception as exc:
                        tool_output = f"Tool error ({block.name}): {str(exc)}"
                        is_error    = True
                        logger.warning(
                            f"[RUN {agent_config.id}] Tool '{block.name}' failed: {exc}"
                        )

                    tool_duration = self._ms_since(tool_start)
                    step_num     += 1

                    # Log the tool result
                    trace.append(TraceStep(
                        step_number = step_num,
                        type        = "tool_result",
                        content     = str(tool_output)[:500],   # cap trace content length
                        tool_name   = block.name,
                        timestamp   = self._now_iso(),
                        duration_ms = tool_duration,
                    ))
                    logger.info(
                        f"[RUN {agent_config.id}] step {step_num}: tool_result — "
                        f"{block.name} — {tool_duration}ms — error={is_error}"
                    )

                    # Build the tool_result message in Anthropic's expected format
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": block.id,        # must match the tool_use block id
                        "content":     str(tool_output),
                        "is_error":    is_error,
                    })

            # ---------- decide what to do next ----------

            if has_tool_use:
                # Claude used a tool — append the full exchange and loop again.
                # The assistant message must include the original content blocks
                # (both text and tool_use) so Claude has context.
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user",      "content": tool_results})
                continue                                # go to next iteration

            # No tool use — Claude is done
            if response.stop_reason == "end_turn":
                logger.info(f"[RUN {agent_config.id}] end_turn — execution complete")
                break

            # Unexpected stop reason (max_tokens, stop_sequence, etc.) — stop safely
            logger.warning(
                f"[RUN {agent_config.id}] Unexpected stop_reason: "
                f"'{response.stop_reason}' — stopping"
            )
            break

        # ---------------------------------------------------------------- done

        total_ms = self._ms_since(run_start)

        # Append one final "final_answer" trace step so the UI can highlight it
        if final_answer:
            step_num += 1
            trace.append(TraceStep(
                step_number = step_num,
                type        = "final_answer",
                content     = final_answer,
                timestamp   = self._now_iso(),
                duration_ms = total_ms,
            ))

        status = "completed" if final_answer else "failed"
        logger.info(
            f"[RUN {agent_config.id}] Finished — "
            f"status={status} | tokens={tokens_total} | duration={total_ms}ms"
        )

        # One last timeout check after the loop finishes
        if total_ms > TIMEOUT_SECONDS * 1000:
            return RunResult(
                final_answer = final_answer,
                run_trace    = trace,
                tokens_used  = tokens_total,
                duration_ms  = total_ms,
                status       = "timeout",
                error_message= "Execution exceeded 60 second limit",
            )

        return RunResult(
            final_answer  = final_answer,
            run_trace     = trace,
            tokens_used   = tokens_total,
            duration_ms   = total_ms,
            status        = status,
            error_message = None if final_answer else "Agent produced no final answer",
        )