"""fastembed → EmbedderPort 어댑터."""
from app.domain.rag.ports import EmbedderPort
from app.infrastructure.vector_store.chroma_adapter import embed_texts, embed_text


class FastembedAdapter(EmbedderPort):
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(texts)

    def embed_text(self, text: str) -> list[float]:
        return embed_text(text)
