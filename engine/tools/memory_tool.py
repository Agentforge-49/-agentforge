import json
import os
import threading
from typing import Dict, Any


class MemoryTool:
    def __init__(self):
        self._lock = threading.Lock()

    def _get_memory_file(self, agent_id: str) -> str:
        return f"/tmp/agentforge_memory_{agent_id}.json"

    def _load_memory(self, agent_id: str) -> Dict[str, Any]:
        memory_file = self._get_memory_file(agent_id)
        if not os.path.exists(memory_file):
            return {}
        try:
            with open(memory_file, 'r') as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_memory(self, agent_id: str, memory: Dict[str, Any]) -> None:
        memory_file = self._get_memory_file(agent_id)
        with self._lock:
            with open(memory_file, 'w') as f:
                json.dump(memory, f, indent=2)

    def get_definition(self) -> dict:
        return {
            "name": "memory",
            "description": "Store, retrieve, list, or delete persistent information across conversations.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "action":   {"type": "string", "enum": ["store", "retrieve", "list_keys", "delete"]},
                    "key":      {"type": "string", "description": "The key to store/retrieve/delete"},
                    "value":    {"type": "string", "description": "The value to store"},
                    "agent_id": {"type": "string", "description": "The agent ID"}
                },
                "required": ["action", "agent_id"]
            }
        }

    def run(self, action: str, agent_id: str, key: str = None, value: str = None) -> str:
        try:
            memory = self._load_memory(agent_id)

            if action == "store":
                if not key:
                    return "Error: key is required"
                memory[key] = value
                self._save_memory(agent_id, memory)
                return f"Stored '{key}' in memory"

            elif action == "retrieve":
                if not key:
                    return "Error: key is required"
                val = memory.get(key)
                return f"Value for '{key}': {val}" if val is not None else f"No value found for '{key}'"

            elif action == "list_keys":
                if not memory:
                    return "No keys stored in memory"
                return f"Stored keys: {', '.join(sorted(memory.keys()))}"

            elif action == "delete":
                if not key:
                    return "Error: key is required"
                if key in memory:
                    del memory[key]
                    self._save_memory(agent_id, memory)
                    return f"Deleted '{key}' from memory"
                return f"Key '{key}' not found"

            else:
                return f"Error: Unknown action '{action}'"

        except Exception as e:
            return f"Memory error: {str(e)}"