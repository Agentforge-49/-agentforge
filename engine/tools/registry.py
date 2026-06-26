from typing import Dict, Any, Optional, List


class ToolRegistry:
    def __init__(self):
        from tools.web_search import WebSearchTool
        from tools.calculator import CalculatorTool
        from tools.datetime_tool import DateTimeTool
        from tools.memory_tool import MemoryTool
        from tools.summarizer import SummarizerTool
        from tools.webhook import WebhookTool
        from tools.webpage_reader import WebpageReaderTool

        self._tools: Dict[str, Any] = {
            "web_search":    WebSearchTool(),
            "calculator":    CalculatorTool(),
            "datetime":      DateTimeTool(),
            "memory":        MemoryTool(),
            "summarizer":    SummarizerTool(),
            # NEW — Day 11
            "webhook":       WebhookTool(),
            "read_webpage":  WebpageReaderTool(),
        }

    def get_tool(self, slug: str) -> Optional[Any]:
        return self._tools.get(slug)

    def get_definitions(self, slugs: List[str]) -> List[dict]:
        definitions = []
        for slug in slugs:
            tool = self._tools.get(slug)
            if tool:
                definitions.append(tool.get_definition())
        return definitions

    def list_tools(self) -> List[str]:
        return list(self._tools.keys())