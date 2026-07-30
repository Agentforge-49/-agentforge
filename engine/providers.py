"""Provider-neutral model execution adapters.

The rest of AgentForge speaks one small contract regardless of the upstream
model API. Provider-specific request and response shapes stay contained here.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import anthropic
import requests


MODEL_CATALOG: Dict[str, Dict[str, str]] = {
    "claude-sonnet-4-6": {
        "provider": "anthropic",
        "label": "Claude Sonnet 4.6",
        "env": "ANTHROPIC_API_KEY",
    },
    "claude-opus-4-6": {
        "provider": "anthropic",
        "label": "Claude Opus 4.6",
        "env": "ANTHROPIC_API_KEY",
    },
    "gpt-5.6-sol": {
        "provider": "openai",
        "label": "GPT-5.6 Sol",
        "env": "OPENAI_API_KEY",
    },
    "gpt-5.6-terra": {
        "provider": "openai",
        "label": "GPT-5.6 Terra",
        "env": "OPENAI_API_KEY",
    },
    "gpt-5.6-luna": {
        "provider": "openai",
        "label": "GPT-5.6 Luna",
        "env": "OPENAI_API_KEY",
    },
    "gemini-3.5-flash": {
        "provider": "google",
        "label": "Gemini 3.5 Flash",
        "env": "GEMINI_API_KEY",
    },
}


class ProviderError(RuntimeError):
    """A sanitized upstream-provider failure safe to return to the API."""

    def __init__(self, provider: str, message: str, code: str = "PROVIDER_ERROR"):
        super().__init__(message)
        self.provider = provider
        self.code = code


@dataclass
class ToolCall:
    id: str
    name: str
    input: Dict[str, Any]


@dataclass
class ModelResponse:
    text: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    stop_reason: str = ""
    raw: Any = None


def _json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _raise_http_error(provider: str, response: requests.Response) -> None:
    if response.status_code == 401 or response.status_code == 403:
        raise ProviderError(provider, f"{provider.title()} credentials were rejected", "AUTHENTICATION")
    if response.status_code == 429:
        raise ProviderError(provider, f"{provider.title()} rate limit reached", "RATE_LIMIT")
    if response.status_code >= 500:
        raise ProviderError(provider, f"{provider.title()} is temporarily unavailable", "UPSTREAM")
    raise ProviderError(
        provider,
        f"{provider.title()} request failed with status {response.status_code}",
        "UPSTREAM_REQUEST",
    )


class AnthropicAdapter:
    provider = "anthropic"

    def __init__(self, api_key: str, timeout_seconds: int = 60):
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_seconds)

    def start(self, user_message: str) -> Dict[str, Any]:
        return {"messages": [{"role": "user", "content": user_message}]}

    def generate(self, config, system_prompt: str, tools: List[dict], state: dict) -> ModelResponse:
        kwargs = {
            "model": config.model,
            "max_tokens": config.max_tokens,
            "system": system_prompt,
            "messages": state["messages"],
        }
        if config.temperature is not None:
            kwargs["temperature"] = config.temperature
        if tools:
            kwargs["tools"] = tools
        try:
            response = self.client.messages.create(**kwargs)
        except anthropic.AuthenticationError as exc:
            raise ProviderError(self.provider, "Anthropic credentials were rejected", "AUTHENTICATION") from exc
        except anthropic.RateLimitError as exc:
            raise ProviderError(self.provider, "Anthropic rate limit reached", "RATE_LIMIT") from exc
        except anthropic.APIError as exc:
            raise ProviderError(self.provider, "Anthropic request failed", "UPSTREAM_REQUEST") from exc

        text_parts = []
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    input=dict(block.input),
                ))
        return ModelResponse(
            text="\n".join(part.strip() for part in text_parts if part.strip()),
            tool_calls=tool_calls,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            stop_reason=response.stop_reason or "",
            raw=response.content,
        )

    def continue_with_tools(self, state: dict, response: ModelResponse, results: List[dict]) -> None:
        state["messages"].append({"role": "assistant", "content": response.raw})
        state["messages"].append({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": result["id"],
                    "content": result["output"],
                    "is_error": result["is_error"],
                }
                for result in results
            ],
        })


class OpenAIAdapter:
    provider = "openai"
    endpoint = "https://api.openai.com/v1/responses"

    def __init__(self, api_key: str, timeout_seconds: int = 60, session=None):
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()

    def start(self, user_message: str) -> Dict[str, Any]:
        return {
            "input": [{"role": "user", "content": user_message}],
            "previous_response_id": None,
        }

    @staticmethod
    def _tools(tools: List[dict]) -> List[dict]:
        return [
            {
                "type": "function",
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
            }
            for tool in tools
        ]

    def generate(self, config, system_prompt: str, tools: List[dict], state: dict) -> ModelResponse:
        payload = {
            "model": config.model,
            "instructions": system_prompt,
            "input": state["input"],
            "max_output_tokens": config.max_tokens,
        }
        if tools:
            payload["tools"] = self._tools(tools)
            payload["tool_choice"] = "auto"
        if state["previous_response_id"]:
            payload["previous_response_id"] = state["previous_response_id"]

        try:
            response = self.session.post(
                self.endpoint,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.Timeout as exc:
            raise ProviderError(self.provider, "OpenAI request timed out", "TIMEOUT") from exc
        except requests.RequestException as exc:
            raise ProviderError(self.provider, "OpenAI network request failed", "NETWORK") from exc
        if not response.ok:
            _raise_http_error(self.provider, response)

        data = response.json()
        state["previous_response_id"] = data.get("id")
        text_parts = []
        tool_calls = []
        for item in data.get("output", []):
            if item.get("type") == "function_call":
                tool_calls.append(ToolCall(
                    id=item.get("call_id") or item.get("id") or "",
                    name=item.get("name") or "",
                    input=_json_object(item.get("arguments")),
                ))
            elif item.get("type") == "message":
                for content in item.get("content", []):
                    if content.get("type") in ("output_text", "text"):
                        text_parts.append(content.get("text", ""))
        usage = data.get("usage") or {}
        return ModelResponse(
            text=(data.get("output_text") or "\n".join(text_parts)).strip(),
            tool_calls=tool_calls,
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
            stop_reason=data.get("status") or "",
            raw=data,
        )

    def continue_with_tools(self, state: dict, _response: ModelResponse, results: List[dict]) -> None:
        state["input"] = [
            {
                "type": "function_call_output",
                "call_id": result["id"],
                "output": result["output"],
            }
            for result in results
        ]


class GeminiAdapter:
    provider = "google"
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, timeout_seconds: int = 60, session=None):
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.session = session or requests.Session()

    def start(self, user_message: str) -> Dict[str, Any]:
        return {
            "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        }

    @staticmethod
    def _tools(tools: List[dict]) -> List[dict]:
        return [{
            "functionDeclarations": [
                {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
                }
                for tool in tools
            ],
        }] if tools else []

    def generate(self, config, system_prompt: str, tools: List[dict], state: dict) -> ModelResponse:
        payload = {
            "contents": state["contents"],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {
                "maxOutputTokens": config.max_tokens,
                "temperature": config.temperature,
            },
        }
        if tools:
            payload["tools"] = self._tools(tools)

        try:
            response = self.session.post(
                self.endpoint.format(model=config.model),
                headers={
                    "x-goog-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self.timeout_seconds,
            )
        except requests.Timeout as exc:
            raise ProviderError(self.provider, "Google request timed out", "TIMEOUT") from exc
        except requests.RequestException as exc:
            raise ProviderError(self.provider, "Google network request failed", "NETWORK") from exc
        if not response.ok:
            _raise_http_error(self.provider, response)

        data = response.json()
        candidates = data.get("candidates") or []
        content = candidates[0].get("content", {}) if candidates else {}
        parts = content.get("parts") or []
        text_parts = []
        tool_calls = []
        for index, part in enumerate(parts):
            if "text" in part:
                text_parts.append(part["text"])
            if "functionCall" in part:
                call = part["functionCall"]
                tool_calls.append(ToolCall(
                    id=f"gemini-{len(state['contents'])}-{index}",
                    name=call.get("name") or "",
                    input=_json_object(call.get("args")),
                ))
        usage = data.get("usageMetadata") or {}
        return ModelResponse(
            text="\n".join(part.strip() for part in text_parts if part.strip()),
            tool_calls=tool_calls,
            input_tokens=int(usage.get("promptTokenCount") or 0),
            output_tokens=int(
                (usage.get("candidatesTokenCount") or 0)
                + (usage.get("thoughtsTokenCount") or 0)
            ),
            stop_reason=(candidates[0].get("finishReason") if candidates else "") or "",
            raw=content,
        )

    def continue_with_tools(self, state: dict, response: ModelResponse, results: List[dict]) -> None:
        state["contents"].append({
            "role": "model",
            "parts": response.raw.get("parts", []),
        })
        state["contents"].append({
            "role": "user",
            "parts": [
                {
                    "functionResponse": {
                        "name": call.name,
                        "response": {
                            "output": result["output"],
                            "is_error": result["is_error"],
                        },
                    },
                }
                for call, result in zip(response.tool_calls, results)
            ],
        })


class ProviderGateway:
    def __init__(self, timeout_seconds: int = 60):
        self.timeout_seconds = timeout_seconds
        self._adapters: Dict[str, Any] = {}

    @staticmethod
    def model_info(model: str) -> Dict[str, str]:
        info = MODEL_CATALOG.get(model)
        if not info:
            raise ProviderError("model", f"Model '{model}' is not supported", "UNSUPPORTED_MODEL")
        return info

    @staticmethod
    def configured_providers() -> Dict[str, bool]:
        providers: Dict[str, bool] = {}
        for info in MODEL_CATALOG.values():
            providers[info["provider"]] = bool(os.getenv(info["env"]))
        return providers

    def adapter_for(self, model: str):
        info = self.model_info(model)
        provider = info["provider"]
        if provider in self._adapters:
            return self._adapters[provider]
        api_key = os.getenv(info["env"])
        if not api_key:
            raise ProviderError(
                provider,
                f"{provider.title()} is not configured for execution",
                "PROVIDER_NOT_CONFIGURED",
            )
        if provider == "anthropic":
            adapter = AnthropicAdapter(api_key, self.timeout_seconds)
        elif provider == "openai":
            adapter = OpenAIAdapter(api_key, self.timeout_seconds)
        elif provider == "google":
            adapter = GeminiAdapter(api_key, self.timeout_seconds)
        else:
            raise ProviderError(provider, "Provider is not supported", "UNSUPPORTED_PROVIDER")
        self._adapters[provider] = adapter
        return adapter

