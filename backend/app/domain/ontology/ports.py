"""Ontology 도메인 Port 인터페이스."""
from abc import ABC, abstractmethod


class GraphStorePort(ABC):
    """그래프 스토어 Port."""

    @abstractmethod
    def add_triples(self, triples: list[dict]) -> None: ...

    @abstractmethod
    def query_path(
        self,
        keywords: list[str],
        max_hops: int = 3,
        max_results: int = 5,
    ) -> list[dict]: ...

    @abstractmethod
    def delete_doc_triples(self, doc_id: str) -> None: ...

    @abstractmethod
    def get_graph_stats(self) -> dict: ...
