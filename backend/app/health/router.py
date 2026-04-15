from fastapi import APIRouter
from app.services.llm_client import health_check
from app.core.db import get_chroma

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health():
    llm_ok = False
    try:
        llm_ok = await health_check()
    except Exception:
        pass

    chroma_ok = False
    try:
        get_chroma()
        chroma_ok = True
    except Exception:
        pass

    return {
        "status": "ok" if (llm_ok and chroma_ok) else "degraded",
        "llm": llm_ok,
        "vector_db": chroma_ok,
    }
