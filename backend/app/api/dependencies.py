"""Composition Root — Lazy 싱글톤 DI 컨테이너.

첫 호출 시 어댑터 인스턴스를 생성합니다.
llama-server 기동 전에도 앱을 시작할 수 있도록 startup 시 연결을 시도하지 않습니다.
"""
from functools import lru_cache

from app.core.config import settings
from app.domain.ontology.ports import GraphStorePort
from app.domain.rag.ports import EmbedderPort, Generator, Retriever
from app.infrastructure.embedding.fastembed_adapter import FastembedAdapter
from app.infrastructure.graph_store.networkx_sqlite_adapter import NetworkxSqliteAdapter
from app.infrastructure.llm.llama_server_adapter import LlamaServerGenerator
from app.infrastructure.vector_store.chroma_adapter import ChromaRetrieverAdapter


@lru_cache(maxsize=1)
def get_generator() -> Generator:
    return LlamaServerGenerator()


@lru_cache(maxsize=1)
def get_retriever() -> Retriever:
    return ChromaRetrieverAdapter()


@lru_cache(maxsize=1)
def get_embedder() -> EmbedderPort:
    return FastembedAdapter()


@lru_cache(maxsize=1)
def get_graph_store() -> GraphStorePort:
    return NetworkxSqliteAdapter()
