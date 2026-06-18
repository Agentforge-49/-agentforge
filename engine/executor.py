import time
import logging
from datetime import datetime, timezone
import anthropic
from models import AgentConfig, TraceStep, RunResult

logger = logging.getLogger(__name__)

PERSONALITY_ADDITIONS = {
    "professional": "Maintain a precise, formal, and thorough communication style.",
    "friendly":     "Be warm, encouraging, and conversational.",
    "concise":      "Be extremely brief and direct. Get straight to the point.",
    "creative":     "Think imaginatively and use vivid language.",
}

MAX_ITERATIONS  = 10
TIMEOUT_SECONDS = 60


class AgentExecutor:
    def __init__(self):
        self.client = anthropic.Anthropic()
        from tools.registry import ToolRegistry
        self.registry = ToolRegistry()

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat()

    def _ms_since(self, start):
        return int((time.time() - start) * 1000)

    def _build_system_prompt(self, config):
        personality_note = PERSONALITY_ADDITIONS.get(config.personality, "")
        parts = [config.system_prompt.strip(), personality_note]
        return "\n\n".join(p for p in parts if p)

    def run(self, agent_config: AgentConfig, user_message: str) -> RunResult:
        run_start    = time.time()
        trace        = []
        step_num     = 0
        tokens_total = 0
        final_answer = ""

        logger.info(f"[RUN {agent_config.id}] Starting agent: {agent_config.name}")

        system_prompt    = self._build_system_prompt(agent_config)
        tool_definitions = self.registry.get_definitions(agent_config.enabled_tool_slugs)
        messages         = [{"role": "user", "content": user_message}]

        for iteration in range(MAX_ITERATIONS):
            if self._ms_since(run_start) > TIMEOUT_SECONDS * 1000:
                return RunResult(
                    final_answer=final_answer,
                    run_trace=trace,
                    tokens_used=tokens_total,
                    duration_ms=self._ms_since(run_start),
                    status="timeout",
                    error_message="Exceeded 60 second limit"
                )

            iter_start = time.time()
            api_kwargs = {
                "model":      agent_config.model,
                "max_tokens": agent_config.max_tokens,
                "system":     system_prompt,
                "messages":   messages,
            }
            if agent_config.temperature is not None:
                api_kwargs["temperature"] = agent_config.temperature
            if tool_definitions:
                api_kwargs["tools"] = tool_definitions

            try:
                response = self.client.messages.create(**api_kwargs)
            except anthropic.APIError as exc:
                step_num += 1
                trace.append(TraceStep(
                    step_number=step_num,
                    type="error",
                    content=f"API error: {str(exc)}",
                    timestamp=self._now_iso(),
                    duration_ms=self._ms_since(iter_start)
                ))
                return RunResult(
                    final_answer=final_answer,
                    run_trace=trace,
                    tokens_used=tokens_total,
                    duration_ms=self._ms_since(run_start),
                    status="failed",
                    error_message=str(exc)
                )

            tokens_total += response.usage.input_tokens + response.usage.output_tokens
            has_tool_use  = False
            tool_results  = []

            for block in response.content:
                if block.type == "text":
                    text = block.text.strip()
                    if not text:
                        continue
                    step_num += 1
                    trace.append(TraceStep(
                        step_number=step_num,
                        type="thinking",
                        content=text,
                        timestamp=self._now_iso(),
                        duration_ms=self._ms_since(iter_start)
                    ))
                    final_answer = text

                elif block.type == "tool_use":
                    has_tool_use = True
                    tool_start   = time.time()
                    step_num    += 1
                    trace.append(TraceStep(
                        step_number=step_num,
                        type="tool_call",
                        content=f"Calling {block.name} with: {str(block.input)[:300]}",
                        tool_name=block.name,
                        tool_input=dict(block.input),
                        timestamp=self._now_iso(),
                        duration_ms=0
                    ))
                    try:
                        tool = self.registry.get_tool(block.name)
                        if tool is None:
                            raise ValueError(f"Tool '{block.name}' not found")
                        tool_output = tool.run(**block.input)
                        is_error    = False
                    except Exception as exc:
                        tool_output = f"Tool error: {str(exc)}"
                        is_error    = True

                    step_num += 1
                    trace.append(TraceStep(
                        step_number=step_num,
                        type="tool_result",
                        content=str(tool_output)[:500],
                        tool_name=block.name,
                        timestamp=self._now_iso(),
                        duration_ms=self._ms_since(tool_start)
                    ))
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": block.id,
                        "content":     str(tool_output),
                        "is_error":    is_error
                    })

            if has_tool_use:
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user",      "content": tool_results})
                continue

            if response.stop_reason == "end_turn":
                break

        total_ms = self._ms_since(run_start)

        if final_answer:
            step_num += 1
            trace.append(TraceStep(
                step_number=step_num,
                type="final_answer",
                content=final_answer,
                timestamp=self._now_iso(),
                duration_ms=total_ms
            ))

        return RunResult(
            final_answer=final_answer,
            run_trace=trace,
            tokens_used=tokens_total,
            duration_ms=total_ms,
            status="completed" if final_answer else "failed",
            error_message=None if final_answer else "No answer generated"
        )