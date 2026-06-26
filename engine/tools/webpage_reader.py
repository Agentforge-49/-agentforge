import requests
from bs4 import BeautifulSoup
import re


class WebpageReaderTool:
    """Tool for fetching and extracting readable text from web pages"""
    
    def get_definition(self) -> dict:
        return {
            "name": "read_webpage",
            "description": "Fetch and read the text content of a specific web page when you already know its exact URL. Different from web_search, which searches the internet by topic instead of reading one known page.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The full URL of the page to read"
                    }
                },
                "required": ["url"]
            }
        }
    
    def run(self, url: str) -> str:
        """Fetch and extract readable text from a web page"""
        try:
            # Validate URL
            if not url or not url.strip():
                return "Error: url is required"
            
            url = url.strip()
            
            # Add scheme if missing
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            
            # Fetch the page with a user agent
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; AgentForge Bot/1.0; +https://agentforge.ai)"
            }
            response = requests.get(url, headers=headers, timeout=10)
            
            # Check status code
            if response.status_code != 200:
                return f"Error: Page returned status {response.status_code}"
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for element in soup.find_all(["script", "style"]):
                element.decompose()
            
            # Extract text with proper spacing
            text = soup.get_text(separator=" ", strip=True)
            
            # Collapse multiple whitespace characters
            text = re.sub(r'\s+', ' ', text)
            
            # If text is empty, try a different approach
            if not text:
                # Try extracting from body only
                body = soup.find('body')
                if body:
                    text = body.get_text(separator=" ", strip=True)
                    text = re.sub(r'\s+', ' ', text)
            
            # Truncate to 3000 characters
            if len(text) > 3000:
                text = text[:3000] + "... (content truncated)"
            
            return text if text else "No readable text found on the page"
        
        except requests.exceptions.Timeout:
            return "Error: The page took too long to respond"
        
        except requests.exceptions.RequestException as e:
            return f"Error: Could not read page - {str(e)}"
        
        except Exception as e:
            return f"Error: Could not read page - {str(e)}"