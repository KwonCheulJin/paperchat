"""
문서 인제스트 라우터.

엔드포인트:
  POST /documents/ingest  — PDF 업로드 → SSE 스트림
  GET  /documents/        — 문서 목록
  DELETE /documents/{doc_id} — 문서 삭제
"""
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.documents.schemas import DeleteResponse, DocumentInfo
from app.documents.service import delete_document, ingest_pdf, list_documents

router = APIRouter(prefix="/documents", tags=["documents"])

# 최대 업로드 크기 50MB
_MAX_BYTES = 50 * 1024 * 1024


@router.post("/ingest")
async def ingest(
    file: UploadFile = File(...),
    folder: str = Form(""),
) -> StreamingResponse:
    """PDF 파일을 받아 인제스트 진행 상황을 SSE로 스트리밍."""
    # Content-Type 검증
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    content = await file.read()

    # 크기 검증
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="파일 크기가 50MB를 초과합니다.")

    # 파일명에서 .pdf 확인 (Content-Type이 octet-stream일 경우 대비)
    filename = file.filename or "unknown.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    return StreamingResponse(
        ingest_pdf(filename, content, folder),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx 버퍼링 비활성화
        },
    )


@router.get("/", response_model=list[DocumentInfo])
async def list_docs() -> list[DocumentInfo]:
    """인제스트된 문서 목록 반환."""
    rows = list_documents()
    return [DocumentInfo(**r) for r in rows]


@router.delete("/{doc_id}", response_model=DeleteResponse)
async def delete_doc(doc_id: str) -> DeleteResponse:
    """문서와 관련 벡터를 모두 삭제."""
    deleted = delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return DeleteResponse(doc_id=doc_id, deleted=True)
