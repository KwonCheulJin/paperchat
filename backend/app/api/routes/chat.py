import uuid
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.domain.chat.service import chat_stream
from app.api.schemas.chat import ChatRequest, FeedbackRequest
from app.core.db import get_sqlite
from app.core.logging_config import get_logger

router = APIRouter(prefix="/chat", tags=["chat"])
logger = get_logger(__name__)


@router.post("/stream")
async def stream(http_request: Request, request: ChatRequest) -> StreamingResponse:
    async def _guarded():
        async for chunk in chat_stream(request):
            if await http_request.is_disconnected():
                logger.info("client_disconnected_chat")
                return
            yield chunk

    return StreamingResponse(
        _guarded(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/feedback")
async def feedback(request: FeedbackRequest) -> dict:
    conn = get_sqlite()
    conn.execute(
        "DELETE FROM message_feedback WHERE message_id = ?",
        (request.message_id,),
    )
    conn.execute(
        "INSERT INTO message_feedback(id, session_id, message_id, rating) VALUES(?,?,?,?)",
        (str(uuid.uuid4()), request.session_id, request.message_id, request.rating),
    )
    conn.commit()
    return {"ok": True}
