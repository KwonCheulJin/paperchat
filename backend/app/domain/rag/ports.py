"""RAG 도메인 Port 인터페이스."""
from abc import ABC, abstractmethod
from typing import AsyncIterator


class Generator(ABC):
    """LLM 텍스트 생성 Port."""

    @abstractmethod
    async def stream(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 512,
        stop_sequences: list[str] | None = None,
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def complete(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 512,
    ) -> str: ...


class EmbedderPort(ABC):
    """텍스트 임베딩 Port."""

    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    def embed_text(self, text: str) -> list[float]: ...


class Retriever(ABC):
    """벡터 검색 Port."""

    @abstractmethod
    def query_dense(
        self,
        query_text: str,
        n_results: int = 30,
        folder: str | None = None,
    ) -> list[dict]: ...

    @abstractmethod
    def upsert_chunks(self, chunks: list[dict]) -> None: ...

    @abstractmethod
    def delete_doc_vectors(self, doc_id: str) -> None: ...

    @abstractmethod
    def fetch_chunks_by_ids(
        self,
        chunk_ids: list[str],
        folder: str | None = None,
    ) -> list[dict]: ...

    @abstractmethod
    def get_parent_texts(self, parent_ids: list[str]) -> dict[str, str]: ...
