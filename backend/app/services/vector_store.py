"""
벡터 스토어 추상화 — ChromaDB embedded + fastembed multilingual-e5-large.

multilingual-e5-large 특징:
- 한국어/영어 등 100개 이상 언어 지원
- 1024차원 dense 벡터
- 최초 실행 시 자동 다운로드 (~600MB)
"""
from __future__ import annotations

from fastembed import TextEmbedding
from app.core.config import settings
from app.core.db import get_chroma, get_sqlite
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# 임베딩 모델 (최초 접근 시 초기화)
_embed_model: TextEmbedding | None = None


def _get_embed_model() -> TextEmbedding:
    global _embed_model
    if _embed_model is None:
        logger.info("embed_model_loading", model=settings.embed_model)
        _embed_model = TextEmbedding(settings.embed_model)
        logger.info("embed_model_loaded", model=settings.embed_model)
    return _embed_model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """텍스트 목록을 dense 벡터로 변환 (동기, run_in_executor 필요 없음 — fastembed는 GIL 해제)."""
    model = _get_embed_model()
    return list(model.embed(texts))


def embed_text(text: str) -> list[float]:
    """단일 텍스트 dense 벡터 변환."""
    return embed_texts([text])[0]


def upsert_chunks(
    chunks: list[dict],  # {"id", "text", "doc_id", "filename", "level", "parent_id", "chunk_index", "folder"}
) -> None:
    """
    paragraph 청크를 ChromaDB에 upsert.
    동시에 SQLite FTS5 인덱스에도 삽입.
    """
    if not chunks:
        return

    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)

    coll = get_chroma()
    coll.upsert(
        ids=[c["id"] for c in chunks],
        embeddings=embeddings,
        documents=texts,
        metadatas=[
            {
                "doc_id": c["doc_id"],
                "filename": c.get("filename", ""),
                "level": c.get("level", "paragraph"),
                "parent_id": c.get("parent_id") or "",
                "chunk_index": c.get("chunk_index", 0),
                "folder": c.get("folder") or "",
            }
            for c in chunks
        ],
    )

    # FTS5 인덱스에도 삽입
    conn = get_sqlite()
    conn.executemany(
        "INSERT OR REPLACE INTO chunks(id, doc_id, text, level, parent_id, chunk_index) VALUES(?,?,?,?,?,?)",
        [
            (
                c["id"],
                c["doc_id"],
                c["text"],
                c.get("level", "paragraph"),
                c.get("parent_id", ""),
                c.get("chunk_index", 0),
            )
            for c in chunks
        ],
    )
    conn.executemany(
        "INSERT OR REPLACE INTO chunks_fts(id, text) VALUES(?,?)",
        [(c["id"], c["text"]) for c in chunks],
    )
    conn.commit()
    logger.info("upsert_done", count=len(chunks))


def query_dense(
    query_text: str,
    n_results: int = 30,
    folder: str | None = None,
) -> list[dict]:
    """dense 벡터 검색 → top-n 반환.

    folder=None → 전체 검색
    folder="" → 기타(미지정) 문서만
    folder="TeamA" → 해당 폴더만
    """
    qvec = embed_text(query_text)
    coll = get_chroma()
    count = coll.count()
    if count == 0:
        return []
    query_kwargs = {
        "query_embeddings": [qvec],
        "n_results": min(n_results, count),
        "include": ["documents", "metadatas", "distances"],
    }
    if folder is not None:
        query_kwargs["where"] = {"folder": folder}
    results = coll.query(**query_kwargs)
    out = []
    for i, cid in enumerate(results["ids"][0]):
        meta = results["metadatas"][0][i]
        out.append({
            "chunk_id": cid,
            "text": results["documents"][0][i],
            "filename": meta.get("filename", ""),
            "doc_id": meta.get("doc_id", ""),
            "parent_id": meta.get("parent_id", ""),
            "chunk_index": meta.get("chunk_index", 0),
            "score": 1.0 - float(results["distances"][0][i]),  # cosine distance → similarity
            "source": "dense",
        })
    return out


def delete_doc_vectors(doc_id: str) -> None:
    """문서 관련 벡터 전체 삭제."""
    coll = get_chroma()
    results = coll.get(where={"doc_id": doc_id})
    if results["ids"]:
        coll.delete(ids=results["ids"])
    # FTS + chunks 삭제
    conn = get_sqlite()
    conn.execute(
        "DELETE FROM chunks_fts WHERE id IN (SELECT id FROM chunks WHERE doc_id=?)",
        (doc_id,),
    )
    conn.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
    conn.commit()
    logger.info("delete_doc_vectors", doc_id=doc_id, deleted=len(results["ids"]))


def get_parent_texts(parent_ids: list[str]) -> dict[str, str]:
    """parent_id → section 텍스트 맵 반환 (부모 청크 확장용)."""
    if not parent_ids:
        return {}
    conn = get_sqlite()
    placeholders = ",".join("?" * len(parent_ids))
    rows = conn.execute(
        f"SELECT id, text FROM chunks WHERE id IN ({placeholders}) AND level='section'",
        parent_ids,
    ).fetchall()
    return {r[0]: r[1] for r in rows}
