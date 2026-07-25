import requests
from tools.http_safety import UnsafeUrlError, safe_request


class WebhookTool:
    """Tool for making HTTP requests to webhooks and external APIs"""
    
    def get_definition(self) -> dict:
        return {
            "name": "webhook",
            "description": "Make an HTTP request to any URL. Use this to call external APIs or trigger webhooks, for example posting a message to a Slack or Discord webhook URL.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The full URL to send the request to"
                    },
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT"],
                        "description": "The HTTP method to use",
                        "default": "GET"
                    },
                    "body": {
                        "type": "string",
                        "description": "Optional JSON text to send as the request body, for POST or PUT requests"
                    }
                },
                "required": ["url"]
            }
        }
    
    def run(self, url: str, method: str = "GET", body: str = None) -> str:
        """Execute an HTTP request to the specified URL"""
        try:
            # Validate URL
            if not url or not url.strip():
                return "Error: url is required"
            
            url = url.strip()
            method = method.upper()
            
            # Prepare headers
            headers = {"User-Agent": "AgentForge/1.0"}
            
            # Execute request based on method
            if method == "GET":
                response = safe_request("GET", url, headers=headers, timeout=10)
            
            elif method == "POST":
                if body and body.strip():
                    headers["Content-Type"] = "application/json"
                    response = safe_request("POST", url, data=body, headers=headers, timeout=10)
                else:
                    response = safe_request("POST", url, headers=headers, timeout=10)
            
            elif method == "PUT":
                if body and body.strip():
                    headers["Content-Type"] = "application/json"
                    response = safe_request("PUT", url, data=body, headers=headers, timeout=10)
                else:
                    response = safe_request("PUT", url, headers=headers, timeout=10)
            
            else:
                return f"Error: Unsupported method '{method}'. Use GET, POST, or PUT."
            
            # Format successful response
            response_text = response.text[:500]
            if len(response.text) > 500:
                response_text += "... (truncated)"
            
            return f"Status: {response.status_code}\nResponse: {response_text}"
        
        except requests.exceptions.Timeout:
            return "Error: The request timed out after 10 seconds"

        except UnsafeUrlError as e:
            return f"Error: Unsafe URL - {str(e)}"
        
        except requests.exceptions.RequestException as e:
            return f"Error: {str(e)}"
        
        except Exception as e:
            return f"Error: {str(e)}"
