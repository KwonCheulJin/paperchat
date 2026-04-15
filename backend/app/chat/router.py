from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.chat.service import chat_stream
from app.chat.schemas import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        chat_stream(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
