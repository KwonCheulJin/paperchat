import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db_schema
from app.core.logging_config import configure_logging, get_logger
from app.documents.router import router as documents_router
from app.health.router import router as health_router
from app.chat.router import router as chat_router
from app.services.priority_scheduler import get_scheduler

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("backend_startup", profile=settings.hardware_profile)
    init_db_schema()
    # 온톨로지 우선순위 스케줄러 백그라운드 시작
    scheduler_task = asyncio.create_task(get_scheduler().background_loop())
    yield
    scheduler_task.cancel()
    logger.info("backend_shutdown")


app = FastAPI(title="DocRAG Backend", version="5.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)

app.include_router(health_router)
app.include_router(documents_router)
app.include_router(chat_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
