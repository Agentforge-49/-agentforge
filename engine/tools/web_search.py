from duckduckgo_search import DDGS


class WebSearchTool:
    def get_definition(self) -> dict:
        return {
            "name": "web_search",
            "description": "Search the internet for current information on any topic.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    },
                    "num_results": {
                        "type": "integer",
                        "description": "Number of results to return (default 5, max 10)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }

    def run(self, query: str, num_results: int = 5) -> str:
        try:
            num_results = min(max(1, num_results), 10)
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=num_results))
            if not results:
                return f"No results found for: '{query}'"
            formatted = []
            for i, r in enumerate(results, 1):
                title = r.get('title', 'No title')
                body  = r.get('body',  'No description')
                href  = r.get('href',  '#')
                formatted.append(f"Result {i}: {title}\n{body}\nURL: {href}")
            return "\n\n".join(formatted)
        except Exception as e:
            return f"Web search error: {str(e)}"