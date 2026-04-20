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
from app.services.llm_client import close_http_client

configure_logging()
logger = get_logger(__name__)


async def _run_entity_migration() -> None:
    """기존 문서(migration_status IS NULL)에 대해 엔티티 추출 백그라운드 처리."""
    from app.core.db import get_sqlite
    from app.core.entity_patterns import extract_entities

    conn = get_sqlite()
    pending = conn.execute(
        "SELECT id FROM documents WHERE migration_status IS NULL ORDER BY ingested_at"
    ).fetchall()

    if not pending:
        return

    logger.info("entity_migration_start", count=len(pending))
    for (doc_id,) in pending:
        try:
            rows = conn.execute(
                "SELECT text FROM chunks WHERE doc_id=? AND level='paragraph'", (doc_id,)
            ).fetchall()
            all_text = "\n".join(r[0] for r in rows)
            entities = extract_entities(all_text, doc_id)
            if entities:
                conn.executemany(
                    "INSERT OR IGNORE INTO doc_entities(id, doc_id, entity_type, value, context, chunk_id)"
                    " VALUES(?,?,?,?,?,?)",
                    [(e["id"], e["doc_id"], e["entity_type"], e["value"], e["context"], e["chunk_id"])
                     for e in entities],
                )
            conn.execute(
                "UPDATE documents SET migration_status='done' WHERE id=?", (doc_id,)
            )
            conn.commit()
            await asyncio.sleep(0)  # 이벤트 루프 양보
        except Exception as exc:
            logger.warning("entity_migration_doc_failed", doc_id=doc_id, error=str(exc))

    logger.info("entity_migration_done")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("backend_startup", profile=settings.hardware_profile)
    init_db_schema()
    # 온톨로지 우선순위 스케줄러 백그라운드 시작
    scheduler_task = asyncio.create_task(get_scheduler().background_loop())
    # 기존 문서 엔티티 마이그레이션
    migration_task = asyncio.create_task(_run_entity_migration())
    yield
    scheduler_task.cancel()
    migration_task.cancel()
    await close_http_client()
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
