import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from models import AgentConfig, RunResult
from executor import AgentExecutor

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="AgentForge Agent Execution Engine", version="1.0.0")

# Define request model
class ExecuteRequest(BaseModel):
    agent_config: AgentConfig
    user_message: str

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize executor
executor = AgentExecutor()


@app.on_event("startup")
async def startup_event():
    """Verify API key on startup"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY environment variable is not set")
        raise RuntimeError("ANTHROPIC_API_KEY is required")
    logger.info("AgentForge Engine ready - API key verified")
    logger.info(f"Registered tools: {list(executor.registry._tools.keys())}")


@app.post("/execute", response_model=RunResult)
async def execute_agent(request: ExecuteRequest):
    """
    Execute an AI agent with the given configuration and user message.
    
    Args:
        request: ExecuteRequest containing agent_config and user_message
    
    Returns:
        RunResult containing the agent's response, trace, token usage, and duration
    """
    logger.info(f"Executing agent: {request.agent_config.name} (ID: {request.agent_config.id})")
    logger.info(f"User message: {request.user_message[:100]}...")
    
    try:
        result = executor.run(request.agent_config, request.user_message)
        logger.info(f"Execution completed with status: {result.status}")
        return result
    except Exception as e:
        logger.error(f"Unexpected error during execution: {str(e)}", exc_info=True)
        return RunResult(
            status="failed",
            error_message=str(e),
            duration_ms=0
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "version": "1.0.0",
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY"))
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)