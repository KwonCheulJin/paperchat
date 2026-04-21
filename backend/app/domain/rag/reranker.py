"""
Cross-Encoder Reranker — BAAI/bge-reranker-v2-m3.
한국어·다국어 특화. Hybrid 검색 결과를 재정렬하여 top-k 반환.
"""
from sentence_transformers import CrossEncoder
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# 싱글톤 Cross-Encoder 모델
_rerank_model: CrossEncoder | None = None

_MODEL_NAME = "BAAI/bge-reranker-v2-m3"


def _get_rerank_model() -> CrossEncoder:
    global _rerank_model
    if _rerank_model is None:
        logger.info("rerank_model_loading", model=_MODEL_NAME)
        _rerank_model = CrossEncoder(_MODEL_NAME, max_length=512)
        logger.info("rerank_model_loaded", model=_MODEL_NAME)
    return _rerank_model


def rerank(query: str, chunks: list[dict], top_k: int = 5) -> list[dict]:
    """
    chunks: hybrid_search 결과 (각 {"chunk_id", "text", "doc_id", "filename", ...})
    반환: top_k 재정렬 결과, 각 chunk에 "rerank_score" 필드 추가
    """
    if not chunks:
        return []

    model = _get_rerank_model()
    pairs = [(query, c["text"]) for c in chunks]
    scores = model.predict(pairs)

    scored = []
    for chunk, score in zip(chunks, scores):
        c = dict(chunk)
        c["rerank_score"] = float(score)
        scored.append(c)

    scored.sort(key=lambda x: x["rerank_score"], reverse=True)
    result = scored[:top_k]

    logger.info("rerank_done", input=len(chunks), top_k=len(result))
    return result
