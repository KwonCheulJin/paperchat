from pydantic import BaseModel


class IngestResponse(BaseModel):
    doc_id: str
    filename: str
    chunk_count: int
    status: str  # "indexed" | "duplicate"
    folder: str = ""


class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    chunk_count: int
    ingested_at: str
    folder: str = ""
    embed_model: str = ""


class DeleteResponse(BaseModel):
    doc_id: str
    deleted: bool
