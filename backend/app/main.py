import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db_schema
from app.core.logging_config import configure_logging, get_logger
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.chat import router as chat_router
from app.domain.rag.scheduler import get_scheduler
from app.infrastructure.llm.llama_server_adapter import close_http_client

configure_logging()
logger = get_logger(__name__)


async def _run_fts5_reindex_migration() -> None:
    """FTS5 스키마 업그레이드 후 기존 문서(migration_status='fts5_reindex') 재인덱싱.

    contextualized 형식 '[문서: X | 섹션: Y]\n{para_text}'에서
    헤더를 제거하고 para_text만 FTS5에 저장한다.
    """
    from app.core.db import get_sqlite

    conn = get_sqlite()
    pending = conn.execute(
        "SELECT id FROM documents WHERE migration_status='fts5_reindex' ORDER BY ingested_at"
    ).fetchall()

    if not pending:
        return

    logger.info("fts5_reindex_migration_start", count=len(pending))
    for (doc_id,) in pending:
        try:
            rows = conn.execute(
                "SELECT id, text FROM chunks WHERE doc_id=? AND level='paragraph'",
                (doc_id,),
            ).fetchall()
            for (chunk_id, contextualized) in rows:
                # "[문서: X | 섹션: Y]\n{para_text}" → para_text 추출
                parts = contextualized.split("\n", 1)
                fts_text = parts[1] if len(parts) > 1 else contextualized
                conn.execute(
                    "INSERT OR REPLACE INTO chunks_fts(id, text) VALUES(?,?)",
                    (chunk_id, fts_text),
                )
            conn.execute(
                "UPDATE documents SET migration_status='done' WHERE id=?", (doc_id,)
            )
            conn.commit()
            await asyncio.sleep(0)  # 이벤트 루프 양보
        except Exception as exc:
            logger.warning("fts5_reindex_doc_failed", doc_id=doc_id, error=str(exc))

    logger.info("fts5_reindex_migration_done")


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


async def _eager_init_embed_model() -> None:
    """fastembed 모델을 startup 시점에 미리 로드해 첫 인제스트 응답 지연을 제거.

    cold load 시 ~600MB 다운로드 또는 ~수십초 onnx 초기화가 발생하는데, lazy 로드 시
    첫 PDF 업로드 응답이 그만큼 지연되어 WebView2 idle timeout 가 끊는 사고로 이어진다.
    """
    from app.infrastructure.vector_store.chroma_adapter import _get_embed_model

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _get_embed_model)
        logger.info("embed_model_eager_init_done")
    except Exception as exc:
        # 실패해도 fatal 아님 — 첫 ingest 시 lazy 로드 경로가 다시 시도한다.
        logger.warning("embed_model_eager_init_failed", error=str(exc))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("backend_startup", profile=settings.hardware_profile)
    init_db_schema()
    # 온톨로지 우선순위 스케줄러 백그라운드 시작
    scheduler_task = asyncio.create_task(get_scheduler().background_loop())
    # FTS5 스키마 업그레이드 후 기존 문서 재인덱싱
    fts5_task = asyncio.create_task(_run_fts5_reindex_migration())
    # 기존 문서 엔티티 마이그레이션
    migration_task = asyncio.create_task(_run_entity_migration())
    # fastembed 모델 eager 로드 (백그라운드, 실패해도 fatal 아님)
    embed_init_task = asyncio.create_task(_eager_init_embed_model())
    yield
    scheduler_task.cancel()
    fts5_task.cancel()
    migration_task.cancel()
    embed_init_task.cancel()
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
