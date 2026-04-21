"""
Hybrid 검색 — BGE-M3 dense (top-20) + BM25 FTS5 (top-20) → RRF 융합 → top-40.

RRF (Reciprocal Rank Fusion):
  score(d) = Σ 1 / (k + rank_i(d))
  k=60 (표준값)

사모펀드 문서에서 정확 용어(펀드명·날짜·금액)는 BM25가 강하고,
의미적 유사도는 dense가 강하므로 융합이 효과적.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from app.infrastructure.vector_store.chroma_adapter import query_dense
from app.core.db import get_sqlite
from app.core.glossary import expand_query as _expand_query
from app.core.logging_config import get_logger, mask_query

logger = get_logger(__name__)

# dense + BM25 병렬 실행용 전용 풀 (요청당 2스레드)
_search_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="search")

RRF_K = 60  # RRF 상수 (표준값)

# Kiwi 형태소 분석 — BM25 색인/쿼리 토큰 추출
# NNG/NNP(명사), NNB(의존명사), NR(수사), NP(대명사), VV/VA(동사/형용사 어간), SL(영문)
# SW(특수문자) 제외: FTS5 예약어(-/*/"등)와 충돌하여 OperationalError 유발
_KIWI_KEEP_TAGS = {"NNG", "NNP", "NNB", "NR", "NP", "VV", "VA", "SL"}
_kiwi = None


def _get_kiwi():
    global _kiwi
    if _kiwi is None:
        try:
            from kiwipiepy import Kiwi
            _kiwi = Kiwi()
            logger.info("kiwi_loaded")
        except ImportError:
            logger.warning("kiwipiepy_not_installed", fallback="whitespace_split")
            _kiwi = False  # 설치 안 된 경우 폴백 표시
    return _kiwi


@lru_cache(maxsize=256)
def _tokenize(text: str) -> list[str]:
    """텍스트를 BM25용 토큰으로 분해. Kiwi 미설치 시 공백 분리 폴백."""
    kiwi = _get_kiwi()
    if not kiwi:
        return text.split()[:10]
    tokens = kiwi.tokenize(text)
    result = [t.form for t in tokens if t.tag in _KIWI_KEEP_TAGS and len(t.form) > 1]
    return result[:10] if result else text.split()[:10]


def _escape_fts5(token: str) -> str:
    """FTS5 쿼리 토큰 이스케이프.

    큰따옴표로 감싸서 예약어(AND/OR/NOT/NEAR/*/-) 충돌 방지.
    토큰 내부의 큰따옴표는 ""로 이스케이프.
    """
    return '"' + token.replace('"', '""') + '"'


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
        # Kiwi 형태소 분석 → 명사/동사 어간만 OR 검색
        tokens = _tokenize(query_text)
        if not tokens:
            return []  # 빈 토큰 → MATCH '' → OperationalError 방지
        fts_query = " OR ".join(_escape_fts5(t) for t in tokens)
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
    logger.info("hybrid_search", query=mask_query(query, 50), expanded=mask_query(expanded, 50), folder=folder)

    # dense(ChromaDB ANN)와 BM25(SQLite FTS5)는 독립적이므로 병렬 실행
    dense_fut = _search_pool.submit(query_dense, expanded, n_dense, folder)
    bm25_fut = _search_pool.submit(query_bm25, expanded, n_bm25, folder)
    dense = dense_fut.result()
    bm25 = bm25_fut.result()

    merged = _rrf_merge(dense, bm25, top_k=top_k)
    logger.info("hybrid_search_done", dense=len(dense), bm25=len(bm25), merged=len(merged))
    return merged
