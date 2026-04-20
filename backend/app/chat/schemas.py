from typing import Literal
import uuid

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ContinuationRequest(BaseModel):
    entity_type: str
    folder: str
    doc_id: str | None = None
    offset: int


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    profile: str = "internal-general"
    session_id: str | None = None
    folder: str | None = None
    continuation: ContinuationRequest | None = None


class FeedbackRequest(BaseModel):
    session_id: str | None = None
    message_id: str
    rating: Literal["up", "down"]


class ChatSourceChunk(BaseModel):
    chunk_id: str
    filename: str
    text: str       # 원본 텍스트 (앞 200자)
    score: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSourceChunk]
    cached: bool = False
    ontology_ready: bool = True
