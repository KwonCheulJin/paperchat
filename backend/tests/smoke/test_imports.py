"""Phase 0 smoke: 모든 핵심 모듈 import 성공 여부 확인.

Phase 2 import 경로 변경 후 이 테스트를 재실행하면 깨진 모듈을 10초 안에 감지.
"""


def test_chat_service_importable():
    from app.domain.chat.service import chat_stream  # noqa: F401


def test_documents_service_importable():
    from app.domain.document.service import ingest_pdf, list_documents, delete_document  # noqa: F401


def test_llm_client_importable():
    from app.infrastructure.llm.llama_server_adapter import stream_chat, health_check  # noqa: F401


def test_vector_store_importable():
    from app.infrastructure.vector_store.chroma_adapter import upsert_chunks, query_dense  # noqa: F401


def test_graph_store_importable():
    from app.infrastructure.graph_store.networkx_sqlite_adapter import query_path, add_triples  # noqa: F401


def test_hybrid_search_importable():
    from app.domain.rag.hybrid_search import hybrid_search  # noqa: F401


def test_reranker_importable():
    from app.domain.rag.reranker import rerank  # noqa: F401


def test_priority_scheduler_importable():
    from app.domain.rag.scheduler import get_scheduler  # noqa: F401


def test_main_app_importable():
    from app.main import app  # noqa: F401


# Phase 1 Port ABC + Adapter
def test_domain_rag_ports_importable():
    from app.domain.rag.ports import Generator, EmbedderPort, Retriever  # noqa: F401


def test_domain_ontology_ports_importable():
    from app.domain.ontology.ports import GraphStorePort  # noqa: F401


def test_infra_llm_adapter_importable():
    from app.infrastructure.llm.llama_server_adapter import LlamaServerGenerator  # noqa: F401


def test_infra_vector_store_adapter_importable():
    from app.infrastructure.vector_store.chroma_adapter import ChromaRetrieverAdapter  # noqa: F401


def test_infra_embedding_adapter_importable():
    from app.infrastructure.embedding.fastembed_adapter import FastembedAdapter  # noqa: F401


def test_infra_graph_store_adapter_importable():
    from app.infrastructure.graph_store.networkx_sqlite_adapter import NetworkxSqliteAdapter  # noqa: F401


def test_domain_document_ports_importable():
    from app.domain.document.ports import PDFParserPort  # noqa: F401


def test_infra_pdf_adapter_importable():
    from app.infrastructure.pdf.pymupdf_adapter import PyMuPDFAdapter  # noqa: F401


def test_di_dependencies_importable():
    from app.api.dependencies import get_generator, get_retriever, get_embedder, get_graph_store  # noqa: F401
