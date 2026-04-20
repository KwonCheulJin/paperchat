import uuid
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.chat.service import chat_stream
from app.chat.schemas import ChatRequest, FeedbackRequest
from app.core.db import get_sqlite

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        chat_stream(request),
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
