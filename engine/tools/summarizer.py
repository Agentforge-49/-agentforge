import anthropic


class SummarizerTool:
    def __init__(self):
        self.client = anthropic.Anthropic()

    def get_definition(self) -> dict:
        return {
            "name": "summarizer",
            "description": "Summarize long text into a shorter, concise version.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text to summarize"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["bullets", "paragraph", "one_line"],
                        "description": "The format for the summary",
                        "default": "paragraph"
                    }
                },
                "required": ["text"]
            }
        }

    def run(self, text: str, format: str = "paragraph") -> str:
        try:
            format_descriptions = {
                "bullets":   "bullet points listing the key information",
                "paragraph": "a single concise paragraph",
                "one_line":  "one sentence only"
            }
            format_desc   = format_descriptions.get(format, "a single concise paragraph")
            system_prompt = f"Summarize the following text in {format_desc}. Be accurate and concise. Return ONLY the summary."

            response = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                system=system_prompt,
                messages=[{"role": "user", "content": text}]
            )
            return response.content[0].text.strip()

        except Exception as e:
            return f"Summarizer error: {str(e)}"