"""
시맨틱 캐시 — 유사 질문은 이전 답변 재활용 (LLM 호출 절감).

임계값: cosine similarity ≥ 0.95
최대 크기: 500개 (LRU 제거)
"""
from __future__ import annotations
import asyncio
import time
from collections import OrderedDict
import numpy as np
from app.infrastructure.vector_store.chroma_adapter import embed_text
from app.core.logging_config import get_logger

logger = get_logger(__name__)

SIMILARITY_THRESHOLD = 0.90
MAX_CACHE_SIZE = 500


class SemanticCache:
    def __init__(self) -> None:
        # {scope_key: {"answer": str, "embedding": list[float], "ts": float, "question": str}}
        # scope_key = "{folder}||{question}" — folder 가 다른 질문은 별도 캐시
        self._cache: OrderedDict[str, dict] = OrderedDict()

    @staticmethod
    def _key(folder: str | None, question: str) -> str:
        return f"{folder or ''}||{question}"

    @staticmethod
    def _scope_prefix(folder: str | None) -> str:
        return f"{folder or ''}||"

    def _cosine(self, a: list[float], b: list[float]) -> float:
        va, vb = np.array(a), np.array(b)
        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        if denom == 0:
            return 0.0
        return float(np.dot(va, vb) / denom)

    async def get(self, question: str, folder: str | None = None) -> str | None:
        """같은 folder 범위 안에서 유사 질문이 있으면 캐시된 답변 반환."""
        if not self._cache:
            return None
        prefix = self._scope_prefix(folder)
        loop = asyncio.get_event_loop()
        qvec = await loop.run_in_executor(None, embed_text, question)
        for k, entry in reversed(list(self._cache.items())):
            if not k.startswith(prefix):
                continue
            sim = self._cosine(qvec, entry["embedding"])
            if sim >= SIMILARITY_THRESHOLD:
                logger.info("cache_hit", question=question[:40], folder=folder or "", similarity=round(sim, 3))
                self._cache.move_to_end(k)
                return entry["answer"]
        return None

    async def put(self, question: str, answer: str, folder: str | None = None) -> None:
        """답변을 folder 스코프로 캐시에 저장."""
        key = self._key(folder, question)
        if key in self._cache:
            self._cache.move_to_end(key)
            return
        if len(self._cache) >= MAX_CACHE_SIZE:
            self._cache.popitem(last=False)
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, embed_text, question)
        self._cache[key] = {
            "answer": answer,
            "embedding": embedding,
            "ts": time.time(),
            "question": question,
        }

    def invalidate_folder(self, folder: str | None) -> int:
        """특정 folder 의 캐시 엔트리 전체 제거 (문서 업로드/삭제 시 호출)."""
        prefix = self._scope_prefix(folder)
        keys = [k for k in self._cache if k.startswith(prefix)]
        for k in keys:
            del self._cache[k]
        return len(keys)

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
