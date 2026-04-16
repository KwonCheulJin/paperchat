"""
Hybrid 검색 — BGE-M3 dense (top-20) + BM25 FTS5 (top-20) → RRF 융합 → top-40.

RRF (Reciprocal Rank Fusion):
  score(d) = Σ 1 / (k + rank_i(d))
  k=60 (표준값)

사모펀드 문서에서 정확 용어(펀드명·날짜·금액)는 BM25가 강하고,
의미적 유사도는 dense가 강하므로 융합이 효과적.
"""
from __future__ import annotations

from app.services.vector_store import query_dense
from app.core.db import get_sqlite
from app.core.glossary import expand_query as _expand_query
from app.core.logging_config import get_logger

logger = get_logger(__name__)

RRF_K = 60  # RRF 상수 (표준값)


def query_bm25(
    query_text: str,
    n_results: int = 20,
    folder: str | None = None,
) -> list[dict]:
    """SQLite FTS5 BM25 검색 → top-n 반환. 쿼리 실패 시 빈 리스트 반환.

    folder=None → 전체 검색
    folder="" → documents.folder = '' (기타) 문서만
    folder="TeamA" → 해당 폴더만
    """
    try:
        conn = get_sqlite()
        # FTS5 MATCH: 공백→OR 검색, 용어 정확 매칭에 강함
        fts_query = " OR ".join(query_text.split()[:10])  # 최대 10토큰
        sql = """
            SELECT c.id, c.text, c.doc_id, c.parent_id, c.chunk_index,
                   bm25(chunks_fts) AS score,
                   d.filename
            FROM chunks_fts
            JOIN chunks c ON chunks_fts.id = c.id
            LEFT JOIN documents d ON c.doc_id = d.id
            WHERE chunks_fts MATCH ?
              AND c.level = 'paragraph'
            """
        params: list = [fts_query]
        if folder is not None:
            sql += " AND d.folder = ?"
            params.append(folder)
        sql += " ORDER BY score LIMIT ?"
        params.append(n_results)
        rows = conn.execute(sql, params).fetchall()
    except Exception as exc:
        logger.warning("bm25_query_failed", error=str(exc))
        return []

    return [
        {
            "chunk_id": r[0],
            "text": r[1],
            "doc_id": r[2],
            "parent_id": r[3] or "",
            "chunk_index": r[4],
            "score": float(-r[5]),  # FTS5 bm25()는 음수 반환 → 양수로 변환
            "filename": r[6] or "",
            "source": "bm25",
        }
        for r in rows
    ]


def _rrf_merge(
    dense_results: list[dict],
    bm25_results: list[dict],
    top_k: int = 50,
) -> list[dict]:
    """RRF 융합 후 top_k 반환."""
    scores: dict[str, float] = {}
    meta: dict[str, dict] = {}

    for rank, chunk in enumerate(dense_results):
        cid = chunk["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        if cid not in meta:
            meta[cid] = chunk

    for rank, chunk in enumerate(bm25_results):
        cid = chunk["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
        if cid not in meta:
            meta[cid] = chunk

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    result = []
    for cid, rrf_score in ranked:
        chunk = dict(meta[cid])
        chunk["rrf_score"] = rrf_score
        result.append(chunk)
    return result


def hybrid_search(
    query: str,
    n_dense: int = 20,
    n_bm25: int = 20,
    top_k: int = 40,
    folder: str | None = None,
) -> list[dict]:
    """
    Hybrid 검색 메인 함수.
    1. 용어 사전 확장 (glossary)
    2. dense top-20 + BM25 top-20
    3. RRF → top-40

    folder=None → 전체 검색, 그 외 → 해당 폴더(빈 문자열은 기타)로 필터링.
    """
    expanded = _expand_query(query)
    logger.info("hybrid_search", query=query[:50], expanded=expanded[:50], folder=folder)

    dense = query_dense(expanded, n_results=n_dense, folder=folder)
    bm25 = query_bm25(expanded, n_results=n_bm25, folder=folder)

    merged = _rrf_merge(dense, bm25, top_k=top_k)
    logger.info("hybrid_search_done", dense=len(dense), bm25=len(bm25), merged=len(merged))
    return merged
