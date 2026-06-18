from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime


class AgentConfig(BaseModel):
    """Configuration for an AI agent"""
    id: str = Field(..., description="Unique identifier for the agent")
    name: str = Field(..., description="Human-readable name of the agent")
    system_prompt: str = Field(..., description="System prompt defining agent behavior")
    personality: Literal["professional", "friendly", "concise", "creative"] = "professional"
    model: str = "claude-sonnet-4-6"
    temperature: float = Field(0.7, ge=0.0, le=1.0)
    max_tokens: int = Field(1000, ge=1, le=4096)
    enabled_tool_slugs: List[str] = Field(default_factory=list)


class TraceStep(BaseModel):
    """Individual step in the agent's execution trace"""
    step_number: int
    type: Literal["thinking", "tool_call", "tool_result", "final_answer", "error"]
    content: str
    tool_name: Optional[str] = None
    tool_input: Optional[dict] = None
    timestamp: str
    duration_ms: int = 0


class RunResult(BaseModel):
    """Result of executing an agent"""
    final_answer: str = ""
    run_trace: List[TraceStep] = Field(default_factory=list)
    tokens_used: int = 0
    duration_ms: int = 0
    status: Literal["completed", "failed", "timeout"] = "completed"
    error_message: Optional[str] = None