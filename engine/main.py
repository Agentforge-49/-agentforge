import asyncio
import os
import logging
import secrets
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from models import AgentConfig, RunResult
from executor import AgentExecutor

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Request model ─────────────────────────────────────────────────────────────
# IMPORTANT: Both fields must be wrapped in this model.
# FastAPI cannot handle two separate body params correctly.
class ExecuteRequest(BaseModel):
    agent_config: AgentConfig
    user_message: str

# ── App startup ───────────────────────────────────────────────────────────────
executor = None
execution_slots = asyncio.Semaphore(max(1, int(os.getenv("ENGINE_MAX_CONCURRENCY", "4"))))


async def run_executor(agent_executor, agent_config, user_message):
    async with execution_slots:
        return await asyncio.to_thread(
            agent_executor.run,
            agent_config,
            user_message,
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    global executor
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in engine/.env")
    executor = AgentExecutor()
    logger.info("AgentForge Engine ready - API key verified")
    logger.info(f"Registered tools: {list(executor.registry._tools.keys())}")
    if not os.getenv("ENGINE_API_KEY"):
        logger.warning("ENGINE_API_KEY is not set; /execute is not protected")
    yield

app = FastAPI(
    title="AgentForge Engine",
    version="1.0.0",
    lifespan=lifespan
)

def require_engine_key(x_agentforge_key: str | None = Header(default=None)):
    """Protect the internal execution endpoint with a shared backend key."""
    expected_key = os.getenv("ENGINE_API_KEY")
    if not expected_key:
        return
    if not x_agentforge_key or not secrets.compare_digest(x_agentforge_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid engine credentials")

# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/execute", response_model=RunResult)
async def execute_agent(
    request: ExecuteRequest,
    _authorized: None = Depends(require_engine_key),
):
    """
    Run an agent. Receives agent_config + user_message wrapped in ExecuteRequest.
    Returns RunResult with final_answer, run_trace, tokens_used, duration_ms, status.
    """
    logger.info(f"Executing agent: {request.agent_config.name} | message: {request.user_message[:80]}")
    try:
        result = await run_executor(executor, request.agent_config, request.user_message)
        logger.info(f"Done — status={result.status} tokens={result.tokens_used} ms={result.duration_ms}")
        return result
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return RunResult(
            status="failed",
            error_message=str(e),
            duration_ms=0
        )

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "anthropic_configured": bool(os.getenv("ANTHROPIC_API_KEY"))
    }

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
