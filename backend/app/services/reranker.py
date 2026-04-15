"""
Cross-Encoder Reranker — cross-encoder/ms-marco-MiniLM-L-6-v2.
Hybrid 검색 top-50을 query와 함께 점수 재계산하여 top-5 반환.
CPU에서 ~50ms.
"""
from fastembed.rerank.cross_encoder import TextCrossEncoder
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# 싱글톤 Cross-Encoder 모델
_rerank_model: TextCrossEncoder | None = None


def _get_rerank_model() -> TextCrossEncoder:
    global _rerank_model
    if _rerank_model is None:
        logger.info("rerank_model_loading")
        _rerank_model = TextCrossEncoder("Xenova/ms-marco-MiniLM-L-6-v2")
        logger.info("rerank_model_loaded")
    return _rerank_model


def rerank(query: str, chunks: list[dict], top_k: int = 5) -> list[dict]:
    """
    chunks: hybrid_search 결과 (각 {"chunk_id", "text", "doc_id", "filename", ...})
    반환: top_k 재정렬 결과, 각 chunk에 "rerank_score" 필드 추가
    """
    if not chunks:
        return []

    model = _get_rerank_model()
    texts = [c["text"] for c in chunks]
    scores = list(model.rerank(query, texts))

    # 점수를 chunk에 추가
    scored = []
    for chunk, score in zip(chunks, scores):
        c = dict(chunk)
        c["rerank_score"] = float(score)
        scored.append(c)

    # 점수 내림차순 정렬 후 top_k 반환
    scored.sort(key=lambda x: x["rerank_score"], reverse=True)
    result = scored[:top_k]

    logger.info("rerank_done", input=len(chunks), top_k=len(result))
    return result
