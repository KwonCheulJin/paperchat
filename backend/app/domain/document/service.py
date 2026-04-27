"""
PDF 인제스트 서비스 — 오케스트레이션.

처리 흐름:
1. SHA-256 해시 → 중복 확인
2. PyMuPDF 텍스트 추출 (실패 시 pdfplumber 폴백)
3. 계층적 청킹 (section → paragraph)
4. paragraph 청크 즉시 임베딩 + ChromaDB/FTS5 upsert
5. SQLite documents 테이블 저장
6. 온톨로지 추출은 백그라운드 스케줄러에 위임
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncGenerator

from app.core.config import settings
from app.core.db import get_sqlite
from app.core.entity_patterns import extract_entities
from app.core.logging_config import get_logger
from app.domain.document.chunker import _chunk_pages_hierarchical
from app.domain.document.indexer import _check_duplicate, _get_file_hash, _save_document
from app.domain.document.parser import _extract_text, _extract_text_ocr, _find_tesseract_cmd
from app.domain.rag.scheduler import get_scheduler
from app.infrastructure.vector_store.chroma_adapter import upsert_chunks

logger = get_logger(__name__)

# SSE comment heartbeat — `data:` 가 아니므로 클라이언트 SSE 파서는 무시.
# WebView2/proxy 의 idle timeout 회피 용도.
_HEARTBEAT = ": keepalive\n\n"

# 긴 blocking 작업 중 heartbeat 송출 간격(초). WebView2 자체 idle threshold 보다 충분히 짧게.
_HEARTBEAT_INTERVAL_S = 15.0


async def _run_blocking_with_heartbeat(fn, *args, interval: float = _HEARTBEAT_INTERVAL_S):
    """blocking fn을 executor에서 실행하면서 interval 마다 ('tick', None) yield.
    완료되면 ('result', value) yield 후 종료. 예외는 호출자에게 전파.

    asyncio.shield 로 감싸 wait_for 타임아웃이 내부 fut 를 취소하지 않게 한다.
    """
    loop = asyncio.get_event_loop()
    fut = loop.run_in_executor(None, fn, *args)
    while True:
        try:
            value = await asyncio.wait_for(asyncio.shield(fut), timeout=interval)
        except asyncio.TimeoutError:
            yield ("tick", None)
            continue
        yield ("result", value)
        return


async def ingest_pdf(
    filename: str,
    content: bytes,
    folder: str = "",
) -> AsyncGenerator[str, None]:
    """
    PDF 인제스트 SSE 스트림.

    각 yield: "data: {json}\n\n" 형식
    마지막 yield: type="done" + IngestResponse 필드
    """

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    # None 방어 (Chroma metadata에 None 저장 금지)
    folder = folder or ""

    # 즉시 SSE 응답 시작을 트리거. WebView2 가 헤더 + 첫 바디 청크를 받자마자
    # idle timeout 카운터를 리셋하므로 이후 blocking 단계 안전.
    yield _HEARTBEAT

    # trace_id: doc_id 생성 전에 filename 기반으로 생성 (doc_id 이후 교체)
    _trace_id = str(uuid.uuid4())[:12]
    _log = logger.bind(trace_id=_trace_id, filename=filename)

    # 1. 중복 확인
    file_hash = _get_file_hash(content)
    existing, stale_doc_id = _check_duplicate(file_hash)
    if existing:
        _log.info("duplicate_doc", filename=filename, doc_id=existing["doc_id"])
        yield _sse({
            "type": "done",
            "doc_id": existing["doc_id"],
            "filename": existing["filename"],
            "chunk_count": existing["chunk_count"],
            "folder": existing.get("folder", ""),
            "status": "duplicate",
        })
        return

    # embed_model 불일치 → 구 벡터/메타데이터 정리 후 재인덱싱
    if stale_doc_id:
        _log.info("stale_doc_cleanup", stale_doc_id=stale_doc_id)
        try:
            delete_document(stale_doc_id)
        except Exception as _de:
            _log.warning("stale_doc_cleanup_failed", error=str(_de))

    yield _sse({"type": "progress", "message": "파싱 중..."})

    # 2. 텍스트 추출 (blocking → executor + heartbeat)
    pages = None
    try:
        async for kind, value in _run_blocking_with_heartbeat(_extract_text, content):
            if kind == "tick":
                yield _HEARTBEAT
            else:
                pages = value
    except ValueError as e:
        yield _sse({"type": "error", "message": str(e)})
        return

    # 2-1. 텍스트 레이어 없음 → OCR 폴백 (스캔 PDF)
    if not pages:
        # Tesseract 없음 → 프론트엔드에 자동 설치 요청
        if _find_tesseract_cmd() is None:
            logger.warning("tesseract_not_found", filename=filename)
            yield _sse({"type": "tesseract_missing", "message": "스캔 PDF 처리를 위한 OCR 엔진이 없습니다. 자동으로 설치합니다..."})
            return

        yield _sse({"type": "progress", "message": "OCR 처리 중... (스캔 PDF 감지됨)"})
        try:
            async for kind, value in _run_blocking_with_heartbeat(_extract_text_ocr, content):
                if kind == "tick":
                    yield _HEARTBEAT
                else:
                    pages = value
        except Exception as e:
            err_msg = str(e)
            logger.error("ocr_failed", error=err_msg)
            yield _sse({"type": "error", "message": f"OCR 처리 중 오류가 발생했습니다: {err_msg}"})
            return

        if not pages:
            yield _sse({"type": "error", "message": "스캔 PDF에서 텍스트를 인식하지 못했습니다. 이미지 해상도가 너무 낮거나 지원하지 않는 언어일 수 있습니다."})
            return

    # 3. 계층적 청킹 (대용량 PDF 에서 느릴 수 있음 → heartbeat)
    doc_id = str(uuid.uuid4())
    _log = _log.bind(doc_id=doc_id)  # trace_id에 doc_id 바인딩
    section_chunks: list = []
    paragraph_chunks: list = []
    async for kind, value in _run_blocking_with_heartbeat(
        _chunk_pages_hierarchical, pages, filename, doc_id
    ):
        if kind == "tick":
            yield _HEARTBEAT
        else:
            section_chunks, paragraph_chunks = value

    # folder는 청크 메타데이터에 일괄 주입 (upsert_chunks에서 Chroma metadata로 기록)
    for c in paragraph_chunks:
        c["folder"] = folder

    total_para = len(paragraph_chunks)
    _log.info(
        "chunking_done",
        sections=len(section_chunks),
        paragraphs=total_para,
    )

    yield _sse({"type": "progress", "message": f"임베딩 중... (0/{total_para} 청크)"})

    # 4. SQLite documents + section 청크 먼저 저장 (paragraph FK 참조 전 필요)
    async for kind, _ in _run_blocking_with_heartbeat(
        _save_document,
        doc_id,
        filename,
        file_hash,
        total_para,
        section_chunks,
        folder,
        settings.embed_model,
    ):
        if kind == "tick":
            yield _HEARTBEAT

    # 5. paragraph 청크 임베딩 + upsert
    # 원자성 보장: ChromaDB 또는 SQLite 실패 시 롤백 (delete_document 호출).
    # 첫 배치에서 fastembed cold load (~600MB 다운로드 또는 ~수십초 onnx 로딩)이 발생할 수 있어
    # 각 배치를 heartbeat 로 감싼다 (Fix-3 eager init 으로 통상 cold load 는 startup 에서 끝남).
    BATCH = 32
    processed = 0
    try:
        for i in range(0, total_para, BATCH):
            batch = paragraph_chunks[i : i + BATCH]
            async for kind, _ in _run_blocking_with_heartbeat(upsert_chunks, batch):
                if kind == "tick":
                    yield _HEARTBEAT
            processed += len(batch)
            yield _sse({
                "type": "progress",
                "message": f"임베딩 중... ({processed}/{total_para} 청크)",
            })
    except Exception as exc:
        _log.error("upsert_failed_rollback", error=str(exc), processed=processed)
        # 롤백: SQLite documents + sections + 부분 chunks + ChromaDB 벡터 정리
        try:
            delete_document(doc_id)
        except Exception as _re:
            _log.error("rollback_failed", rollback_error=str(_re))
        yield _sse({"type": "error", "message": f"인덱싱 실패 (롤백 완료): {exc}"})
        return

    # 5.5. 엔티티 추출 + SQLite 저장
    all_text = "\n".join(p["text"] for p in paragraph_chunks)
    entities = extract_entities(all_text, doc_id)
    if entities:
        conn = get_sqlite()
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
        _log.info("entities_extracted", count=len(entities))

    # 6. 백그라운드 온톨로지 큐잉
    get_scheduler().enqueue_ontology(doc_id, paragraph_chunks)

    # 7. 해당 folder 의 SemanticCache 무효화
    # (새 문서가 들어왔으므로 기존 캐시된 답변은 stale)
    try:
        from app.domain.rag.cache import get_cache
        removed = get_cache().invalidate_folder(folder)
        if removed:
            _log.info("cache_invalidated_on_upload", folder=folder or "", removed=removed)
    except Exception as _ce:
        _log.warning("cache_invalidate_failed", error=str(_ce))

    _log.info("ingest_done", chunks=total_para)

    yield _sse({
        "type": "done",
        "doc_id": doc_id,
        "filename": filename,
        "chunk_count": total_para,
        "status": "indexed",
        "folder": folder,
    })


def list_documents() -> list[dict]:
    """저장된 문서 목록 반환."""
    conn = get_sqlite()
    rows = conn.execute(
        "SELECT id, filename, chunk_count, ingested_at, folder, embed_model"
        " FROM documents ORDER BY ingested_at DESC"
    ).fetchall()
    return [
        {
            "doc_id": r[0],
            "filename": r[1],
            "chunk_count": r[2],
            "ingested_at": r[3],
            "folder": r[4] or "",
            "embed_model": r[5] or "",
        }
        for r in rows
    ]


def delete_document(doc_id: str) -> bool:
    """문서 + 관련 벡터 전체 삭제. 성공 시 True."""
    from app.infrastructure.vector_store.chroma_adapter import delete_doc_vectors

    conn = get_sqlite()
    row = conn.execute("SELECT id, folder FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        return False
    folder = row[1] if len(row) > 1 else None

    # 1. FTS5 먼저 삭제 (virtual table은 CASCADE 미적용)
    conn.execute(
        "DELETE FROM chunks_fts WHERE id IN (SELECT id FROM chunks WHERE doc_id=?)",
        (doc_id,),
    )
    # 2. documents 삭제 (FOREIGN KEY CASCADE로 chunks 자동 삭제)
    conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
    conn.commit()

    # 3. ChromaDB 벡터 삭제 (SQLite 커밋 이후 — 실패해도 메타데이터는 이미 제거됨)
    try:
        delete_doc_vectors(doc_id)
    except Exception as e:
        logger.warning("chroma_delete_failure", doc_id=doc_id, error=str(e))

    # 4. 해당 folder 의 SemanticCache 무효화
    # (문서가 사라졌으므로 기존 문서 기반 답변을 재사용하면 안 됨)
    try:
        from app.domain.rag.cache import get_cache
        removed = get_cache().invalidate_folder(folder)
        if removed:
            logger.info("cache_invalidated_on_delete", folder=folder or "", removed=removed)
    except Exception as e:
        logger.warning("cache_invalidate_failed", error=str(e))

    logger.info("delete_document", doc_id=doc_id, folder=folder or "")
    return True
