"""문서 인덱싱 — SQLite 저장 + 해시 기반 중복 확인."""
from __future__ import annotations

import hashlib

from app.core.config import settings
from app.core.db import get_sqlite
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def _get_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _check_duplicate(file_hash: str) -> tuple[dict | None, str | None]:
    """file_hash로 기존 문서 조회.

    반환값: (duplicate_info, stale_doc_id)
    - (dict, None)  : 동일 모델 중복 → 재인덱싱 불필요
    - (None, str)   : 모델 불일치 → stale_doc_id 삭제 후 재인덱싱
    - (None, None)  : 신규 문서
    embed_model='' (마이그레이션 전 문서)는 unknown으로 간주해 호환 처리.
    """
    conn = get_sqlite()
    row = conn.execute(
        "SELECT id, filename, chunk_count, folder, embed_model FROM documents WHERE file_hash=?",
        (file_hash,),
    ).fetchone()
    if row:
        stored_model = row[4] or ""
        if stored_model and stored_model != settings.embed_model:
            return None, row[0]  # 모델 변경 → 구 doc_id 삭제 필요
        return {
            "doc_id": row[0],
            "filename": row[1],
            "chunk_count": row[2],
            "folder": row[3] or "",
        }, None
    return None, None


def _save_document(
    doc_id: str,
    filename: str,
    file_hash: str,
    chunk_count: int,
    section_chunks: list[dict],
    folder: str,
    embed_model: str = "",
) -> None:
    """documents 테이블 + section chunks → SQLite 저장."""
    conn = get_sqlite()

    conn.execute(
        "INSERT INTO documents(id, filename, file_hash, chunk_count, folder, embed_model)"
        " VALUES(?,?,?,?,?,?)",
        (doc_id, filename, file_hash, chunk_count, folder, embed_model),
    )

    # 섹션 청크는 SQLite chunks 테이블에만 저장
    conn.executemany(
        "INSERT INTO chunks(id, doc_id, text, level, parent_id, chunk_index) VALUES(?,?,?,?,?,?)",
        [
            (
                c["id"],
                c["doc_id"],
                c["text"],
                c["level"],
                c.get("parent_id"),
                c.get("chunk_index", 0),
            )
            for c in section_chunks
        ],
    )
    conn.commit()
