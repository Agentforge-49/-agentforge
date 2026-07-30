import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from executor import AgentExecutor
from models import AgentConfig
from providers import (
    GeminiAdapter,
    ModelResponse,
    OpenAIAdapter,
    ProviderGateway,
    ToolCall,
)


class FakeHttpResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.ok = 200 <= status_code < 300

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class ProviderAdapterTests(unittest.TestCase):
    def setUp(self):
        self.config = SimpleNamespace(
            model="gpt-5.6-sol",
            max_tokens=800,
            temperature=0.3,
        )
        self.tool = {
            "name": "calculator",
            "description": "Calculate a value",
            "input_schema": {
                "type": "object",
                "properties": {"expression": {"type": "string"}},
            },
        }

    def test_catalog_routes_models_and_reports_configuration(self):
        self.assertEqual(
            ProviderGateway.model_info("gpt-5.6-terra")["provider"],
            "openai",
        )
        self.assertEqual(
            ProviderGateway.model_info("gemini-3.5-flash")["provider"],
            "google",
        )
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "anthropic-test",
            "OPENAI_API_KEY": "",
            "GEMINI_API_KEY": "google-test",
        }, clear=False):
            self.assertEqual(ProviderGateway.configured_providers(), {
                "anthropic": True,
                "openai": False,
                "google": True,
            })

    def test_openai_adapter_normalizes_text_and_tool_calls(self):
        session = FakeSession(FakeHttpResponse({
            "id": "response-1",
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "Checking."}],
                },
                {
                    "type": "function_call",
                    "call_id": "call-1",
                    "name": "calculator",
                    "arguments": '{"expression":"2+2"}',
                },
            ],
            "usage": {"input_tokens": 12, "output_tokens": 5},
        }))
        adapter = OpenAIAdapter("test-key", session=session)
        state = adapter.start("What is 2+2?")
        response = adapter.generate(self.config, "Be accurate.", [self.tool], state)
        self.assertEqual(response.text, "Checking.")
        self.assertEqual(response.tool_calls[0].input, {"expression": "2+2"})
        self.assertEqual(response.input_tokens, 12)
        self.assertEqual(
            session.calls[0][1]["json"]["tools"][0]["parameters"],
            self.tool["input_schema"],
        )
        adapter.continue_with_tools(state, response, [{
            "id": "call-1",
            "output": "4",
            "is_error": False,
        }])
        self.assertEqual(state["previous_response_id"], "response-1")
        self.assertEqual(state["input"][0]["type"], "function_call_output")

    def test_gemini_adapter_normalizes_text_and_tool_calls(self):
        session = FakeSession(FakeHttpResponse({
            "candidates": [{
                "finishReason": "STOP",
                "content": {
                    "parts": [
                        {"text": "Checking."},
                        {"functionCall": {
                            "name": "calculator",
                            "args": {"expression": "3+3"},
                        }},
                    ],
                },
            }],
            "usageMetadata": {
                "promptTokenCount": 9,
                "candidatesTokenCount": 4,
                "thoughtsTokenCount": 2,
            },
        }))
        adapter = GeminiAdapter("test-key", session=session)
        config = SimpleNamespace(
            model="gemini-3.5-flash",
            max_tokens=800,
            temperature=0.3,
        )
        state = adapter.start("What is 3+3?")
        response = adapter.generate(config, "Be accurate.", [self.tool], state)
        self.assertEqual(response.text, "Checking.")
        self.assertEqual(response.tool_calls[0].input, {"expression": "3+3"})
        self.assertEqual(response.output_tokens, 6)
        self.assertEqual(
            session.calls[0][1]["json"]["tools"][0]["functionDeclarations"][0]["name"],
            "calculator",
        )
        adapter.continue_with_tools(state, response, [{
            "id": response.tool_calls[0].id,
            "output": "6",
            "is_error": False,
        }])
        self.assertEqual(state["contents"][-1]["role"], "user")


class ExecutorGatewayTests(unittest.TestCase):
    def test_executor_runs_provider_neutral_tool_loop(self):
        class FakeTool:
            def run(self, **_kwargs):
                return "4"

        class FakeRegistry:
            def get_definitions(self, _slugs):
                return [{"name": "calculator", "input_schema": {"type": "object"}}]

            def get_tool(self, name):
                return FakeTool() if name == "calculator" else None

        class FakeAdapter:
            def __init__(self):
                self.calls = 0
                self.results = None

            def start(self, message):
                return {"message": message}

            def generate(self, *_args):
                self.calls += 1
                if self.calls == 1:
                    return ModelResponse(
                        text="I will calculate that.",
                        tool_calls=[ToolCall("call-1", "calculator", {"expression": "2+2"})],
                        input_tokens=5,
                        output_tokens=3,
                    )
                return ModelResponse(text="The answer is 4.", input_tokens=4, output_tokens=5)

            def continue_with_tools(self, _state, _response, results):
                self.results = results

        adapter = FakeAdapter()

        class FakeGateway:
            @staticmethod
            def model_info(_model):
                return {"provider": "openai"}

            @staticmethod
            def adapter_for(_model):
                return adapter

        executor = AgentExecutor(gateway=FakeGateway(), registry=FakeRegistry())
        result = executor.run(
            AgentConfig(
                id="agent-1",
                name="Calculator",
                system_prompt="Use tools.",
                model="gpt-5.6-sol",
                enabled_tool_slugs=["calculator"],
            ),
            "What is 2+2?",
        )
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.provider, "openai")
        self.assertEqual(result.model, "gpt-5.6-sol")
        self.assertEqual(result.final_answer, "The answer is 4.")
        self.assertEqual(result.tokens_used, 17)
        self.assertEqual(adapter.results[0]["output"], "4")


if __name__ == "__main__":
    unittest.main()
