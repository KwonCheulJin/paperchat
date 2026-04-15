"""
시맨틱 캐시 — 유사 질문은 이전 답변 재활용 (LLM 호출 절감).

임계값: cosine similarity ≥ 0.95
최대 크기: 500개 (LRU 제거)
"""
from __future__ import annotations
import time
from collections import OrderedDict
import numpy as np
from app.services.vector_store import embed_text
from app.core.logging_config import get_logger

logger = get_logger(__name__)

SIMILARITY_THRESHOLD = 0.95
MAX_CACHE_SIZE = 500


class SemanticCache:
    def __init__(self) -> None:
        # {question: {"answer": str, "embedding": list[float], "ts": float}}
        self._cache: OrderedDict[str, dict] = OrderedDict()

    def _cosine(self, a: list[float], b: list[float]) -> float:
        va, vb = np.array(a), np.array(b)
        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        if denom == 0:
            return 0.0
        return float(np.dot(va, vb) / denom)

    async def get(self, question: str) -> str | None:
        """유사 질문이 있으면 캐시된 답변 반환."""
        if not self._cache:
            return None
        qvec = embed_text(question)
        for q, entry in reversed(list(self._cache.items())):
            sim = self._cosine(qvec, entry["embedding"])
            if sim >= SIMILARITY_THRESHOLD:
                logger.info("cache_hit", question=question[:40], similarity=round(sim, 3))
                # LRU 업데이트
                self._cache.move_to_end(q)
                return entry["answer"]
        return None

    async def put(self, question: str, answer: str) -> None:
        """답변을 캐시에 저장."""
        if question in self._cache:
            self._cache.move_to_end(question)
            return
        if len(self._cache) >= MAX_CACHE_SIZE:
            self._cache.popitem(last=False)  # 가장 오래된 항목 제거
        embedding = embed_text(question)
        self._cache[question] = {"answer": answer, "embedding": embedding, "ts": time.time()}

    def clear(self) -> None:
        self._cache.clear()

    def size(self) -> int:
        return len(self._cache)


_cache: SemanticCache | None = None


def get_cache() -> SemanticCache:
    global _cache
    if _cache is None:
        _cache = SemanticCache()
    return _cache
