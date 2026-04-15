from typing import Literal

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    profile: str = "internal-general"
    session_id: str | None = None
    folder: str | None = None


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
