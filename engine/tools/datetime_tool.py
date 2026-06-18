from datetime import datetime, timedelta, timezone
from dateutil import parser


class DateTimeTool:
    def get_definition(self) -> dict:
        return {
            "name": "datetime",
            "description": "Get current date/time, calculate differences, add days, or find day of week.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get_current", "days_between", "add_days", "day_of_week"],
                        "description": "The action to perform"
                    },
                    "date1":  {"type": "string", "description": "First date (YYYY-MM-DD)"},
                    "date2":  {"type": "string", "description": "Second date (YYYY-MM-DD)"},
                    "date":   {"type": "string", "description": "Date for add_days or day_of_week"},
                    "days":   {"type": "integer", "description": "Number of days to add"}
                },
                "required": ["action"]
            }
        }

    def run(self, action: str, **kwargs) -> str:
        try:
            if action == "get_current":
                now = datetime.now(timezone.utc)
                return f"Today is {now.strftime('%A, %B %d, %Y')}. Current UTC time: {now.strftime('%H:%M')}"

            elif action == "days_between":
                date1 = parser.parse(kwargs.get("date1")).date()
                date2 = parser.parse(kwargs.get("date2")).date()
                delta = abs((date2 - date1).days)
                return f"There are {delta} days between {date1} and {date2}"

            elif action == "add_days":
                date = parser.parse(kwargs.get("date")).date()
                days = kwargs.get("days", 0)
                new_date = date + timedelta(days=days)
                return f"{days} days from {date} is {new_date}"

            elif action == "day_of_week":
                date = parser.parse(kwargs.get("date")).date()
                return f"{date} is a {date.strftime('%A')}"

            else:
                return f"Error: Unknown action '{action}'"

        except Exception as e:
            return f"DateTime error: {str(e)}"