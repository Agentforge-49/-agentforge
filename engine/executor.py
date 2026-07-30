import logging
import time
from datetime import datetime, timezone

from models import AgentConfig, RunResult, TraceStep
from providers import ProviderError, ProviderGateway

logger = logging.getLogger(__name__)

PERSONALITY_ADDITIONS = {
    "professional": "Maintain a precise, formal, and thorough communication style.",
    "friendly": "Be warm, encouraging, and conversational.",
    "concise": "Be extremely brief and direct. Get straight to the point.",
    "creative": "Think imaginatively and use vivid language.",
}

MAX_ITERATIONS = 10
TIMEOUT_SECONDS = 60


class AgentExecutor:
    def __init__(self, gateway=None, registry=None):
        self.gateway = gateway or ProviderGateway(timeout_seconds=TIMEOUT_SECONDS)
        if registry is None:
            from tools.registry import ToolRegistry
            registry = ToolRegistry()
        self.registry = registry

    def _now_iso(self):
        return datetime.now(timezone.utc).isoformat()

    def _ms_since(self, start):
        return int((time.time() - start) * 1000)

    def _build_system_prompt(self, config):
        personality_note = PERSONALITY_ADDITIONS.get(config.personality, "")
        parts = [config.system_prompt.strip(), personality_note]
        return "\n\n".join(part for part in parts if part)

    def run(self, agent_config: AgentConfig, user_message: str) -> RunResult:
        run_start = time.time()
        trace = []
        step_num = 0
        tokens_total = 0
        final_answer = ""

        try:
            model_info = self.gateway.model_info(agent_config.model)
            provider = model_info["provider"]
        except ProviderError as exc:
            return RunResult(
                status="failed",
                model=agent_config.model,
                error_code=exc.code,
                error_message=str(exc),
            )
        logger.info(
            "[RUN %s] Starting agent=%s provider=%s model=%s",
            agent_config.id,
            agent_config.name,
            provider,
            agent_config.model,
        )

        try:
            adapter = self.gateway.adapter_for(agent_config.model)
        except ProviderError as exc:
            return RunResult(
                status="failed",
                provider=provider,
                model=agent_config.model,
                error_code=exc.code,
                error_message=str(exc),
            )

        system_prompt = self._build_system_prompt(agent_config)
        tool_definitions = self.registry.get_definitions(agent_config.enabled_tool_slugs)
        state = adapter.start(user_message)

        for _iteration in range(MAX_ITERATIONS):
            if self._ms_since(run_start) > TIMEOUT_SECONDS * 1000:
                return RunResult(
                    final_answer=final_answer,
                    run_trace=trace,
                    tokens_used=tokens_total,
                    duration_ms=self._ms_since(run_start),
                    status="timeout",
                    provider=provider,
                    model=agent_config.model,
                    error_code="EXECUTION_TIMEOUT",
                    error_message="Exceeded 60 second limit",
                )

            iteration_start = time.time()
            try:
                response = adapter.generate(
                    agent_config,
                    system_prompt,
                    tool_definitions,
                    state,
                )
            except ProviderError as exc:
                step_num += 1
                trace.append(TraceStep(
                    step_number=step_num,
                    type="error",
                    content=str(exc),
                    timestamp=self._now_iso(),
                    duration_ms=self._ms_since(iteration_start),
                ))
                return RunResult(
                    final_answer=final_answer,
                    run_trace=trace,
                    tokens_used=tokens_total,
                    duration_ms=self._ms_since(run_start),
                    status="failed",
                    provider=provider,
                    model=agent_config.model,
                    error_code=exc.code,
                    error_message=str(exc),
                )

            tokens_total += response.input_tokens + response.output_tokens
            if response.text:
                step_num += 1
                trace.append(TraceStep(
                    step_number=step_num,
                    type="thinking",
                    content=response.text,
                    timestamp=self._now_iso(),
                    duration_ms=self._ms_since(iteration_start),
                ))
                final_answer = response.text

            if not response.tool_calls:
                break

            tool_results = []
            for call in response.tool_calls:
                tool_start = time.time()
                step_num += 1
                trace.append(TraceStep(
                    step_number=step_num,
                    type="tool_call",
                    content=f"Calling {call.name}",
                    tool_name=call.name,
                    tool_input=call.input,
                    timestamp=self._now_iso(),
                    duration_ms=0,
                ))
                try:
                    tool = self.registry.get_tool(call.name)
                    if tool is None:
                        raise ValueError(f"Tool '{call.name}' not found")
                    output = str(tool.run(**call.input))
                    is_error = False
                except Exception as exc:
                    output = f"Tool error: {str(exc)}"
                    is_error = True

                step_num += 1
                trace.append(TraceStep(
                    step_number=step_num,
                    type="tool_result",
                    content=output[:500],
                    tool_name=call.name,
                    timestamp=self._now_iso(),
                    duration_ms=self._ms_since(tool_start),
                ))
                tool_results.append({
                    "id": call.id,
                    "output": output,
                    "is_error": is_error,
                })

            adapter.continue_with_tools(state, response, tool_results)

        total_ms = self._ms_since(run_start)
        if final_answer:
            step_num += 1
            trace.append(TraceStep(
                step_number=step_num,
                type="final_answer",
                content=final_answer,
                timestamp=self._now_iso(),
                duration_ms=total_ms,
            ))

        return RunResult(
            final_answer=final_answer,
            run_trace=trace,
            tokens_used=tokens_total,
            duration_ms=total_ms,
            status="completed" if final_answer else "failed",
            provider=provider,
            model=agent_config.model,
            error_code=None if final_answer else "NO_ANSWER",
            error_message=None if final_answer else "No answer generated",
        )
