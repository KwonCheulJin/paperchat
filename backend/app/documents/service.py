"""
PDF 인제스트 서비스.

처리 흐름:
1. SHA-256 해시 → 중복 확인
2. PyMuPDF 텍스트 추출 (실패 시 pdfplumber 폴백)
3. 계층적 청킹 (section → paragraph)
4. paragraph 청크 즉시 임베딩 + ChromaDB/FTS5 upsert
5. SQLite documents 테이블 저장
6. 온톨로지 추출은 백그라운드 스케줄러에 위임
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from typing import AsyncGenerator

from app.core.db import get_sqlite
from app.core.entity_patterns import extract_entities
from app.core.logging_config import get_logger
from app.services.priority_scheduler import get_scheduler
from app.services.vector_store import upsert_chunks

logger = get_logger(__name__)

# 섹션 분할 기준 단어 수
_SECTION_MAX_WORDS = 200
# paragraph 기준 단어 수
_PARA_MAX_WORDS = 150


# ---------------------------------------------------------------------------
# 텍스트 추출
# ---------------------------------------------------------------------------

def _extract_text_pymupdf(content: bytes) -> list[str]:
    """PyMuPDF로 페이지별 텍스트 추출. 페이지 순서 보존."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=content, filetype="pdf")
    pages: list[str] = []
    for page in doc:
        text = page.get_text("text")
        if text.strip():
            pages.append(text)
    doc.close()
    return pages


def _find_tesseract_cmd() -> str | None:
    """Tesseract 실행 파일 경로 탐색.

    우선순위:
    1. TESSERACT_CMD 환경 변수 (Tauri에서 주입)
    2. Windows 기본 설치 경로
    """
    import os, sys
    env_path = os.environ.get("TESSERACT_CMD")
    if env_path and os.path.exists(env_path):
        return env_path
    if sys.platform != "win32":
        return None
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def _extract_text_ocr(content: bytes) -> list[str]:
    """Tesseract OCR로 스캔 PDF 텍스트 추출 (페이지별 이미지 렌더링 → OCR).

    텍스트 레이어가 있는 페이지는 OCR 없이 직접 추출.
    """
    import fitz
    from PIL import Image, ImageFilter, ImageEnhance
    import pytesseract

    # Windows Tesseract 경로 자동 설정
    tess_cmd = _find_tesseract_cmd()
    if tess_cmd:
        pytesseract.pytesseract.tesseract_cmd = tess_cmd

    doc = fitz.open(stream=content, filetype="pdf")
    pages: list[str] = []

    for page in doc:
        # 텍스트 레이어 우선 사용
        existing = page.get_text().strip()
        if len(existing) >= 50:
            pages.append(existing)
            continue

        # 300 DPI 렌더링
        mat = fitz.Matrix(300 / 72, 300 / 72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # 전처리: 그레이스케일 → 대비 향상 → 샤프닝
        img_gray = img.convert("L")
        img_enh = ImageEnhance.Contrast(img_gray).enhance(2.0)
        img_sharp = img_enh.filter(ImageFilter.SHARPEN)

        text = pytesseract.image_to_string(
            img_sharp,
            lang="kor+eng",
            config="--psm 3 --oem 1",
        )
        if text.strip():
            pages.append(text)

    doc.close()
    return pages


def _extract_text_pdfplumber(content: bytes) -> list[str]:
    """pdfplumber 폴백 — PyMuPDF 실패 시 사용."""
    import io
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


def _extract_text(content: bytes) -> list[str]:
    """텍스트 추출. PyMuPDF 우선, 실패 시 pdfplumber 폴백."""
    try:
        pages = _extract_text_pymupdf(content)
        if pages:
            return pages
    except Exception as e:
        logger.warning("pymupdf_failed", error=str(e))

    try:
        return _extract_text_pdfplumber(content)
    except Exception as e:
        logger.error("pdfplumber_failed", error=str(e))
        raise ValueError("PDF 텍스트 추출 실패") from e


# ---------------------------------------------------------------------------
# 계층적 청킹
# ---------------------------------------------------------------------------

def _split_into_words(text: str) -> list[str]:
    return text.split()


def _split_section_by_words(text: str, max_words: int) -> list[str]:
    """섹션 텍스트가 max_words 초과 시 추가 분할."""
    words = _split_into_words(text)
    if len(words) <= max_words:
        return [text]

    chunks: list[str] = []
    for i in range(0, len(words), max_words):
        chunk = " ".join(words[i : i + max_words])
        if chunk.strip():
            chunks.append(chunk)
    return chunks


def _detect_heading(line: str) -> bool:
    """간단한 헤딩 감지: 짧고(60자 이내) 마침표로 끝나지 않는 줄."""
    stripped = line.strip()
    if not stripped:
        return False
    if len(stripped) > 60:
        return False
    if stripped.endswith(".") or stripped.endswith(","):
        return False
    # 숫자로 시작하는 목차 패턴 (예: "1.", "1.1", "Chapter 1")
    first_word = stripped.split()[0] if stripped.split() else ""
    if first_word.rstrip(".").replace(".", "").isdigit():
        return True
    # 대문자 시작 + 짧은 줄
    if stripped[0].isupper() and len(stripped.split()) <= 8:
        return True
    return False


def _chunk_pages_hierarchical(
    pages: list[str],
    filename: str,
    doc_id: str,
) -> tuple[list[dict], list[dict]]:
    """
    페이지 텍스트를 section + paragraph 청크로 분할.

    반환:
        (section_chunks, paragraph_chunks)
        - section_chunks: SQLite 전용 (level="section")
        - paragraph_chunks: ChromaDB + SQLite (level="paragraph")
    """
    section_chunks: list[dict] = []
    paragraph_chunks: list[dict] = []

    current_heading = "본문"
    current_lines: list[str] = []

    # 섹션 누적 후 분할 처리
    def _flush_section(heading: str, lines: list[str], sec_idx: int) -> int:
        """누적된 lines를 섹션 → paragraph로 분할. 다음 sec_idx 반환."""
        section_text = "\n".join(lines).strip()
        if not section_text:
            return sec_idx

        # 섹션이 너무 크면 단어 수 기준 재분할
        section_parts = _split_section_by_words(section_text, _SECTION_MAX_WORDS)

        for part_i, part_text in enumerate(section_parts):
            part_heading = heading if len(section_parts) == 1 else f"{heading} ({part_i + 1})"
            sec_chunk_id = f"{doc_id}_section_{sec_idx}"

            section_chunks.append({
                "id": sec_chunk_id,
                "doc_id": doc_id,
                "text": part_text,
                "level": "section",
                "parent_id": None,
                "chunk_index": sec_idx,
                "filename": filename,
                "section_title": part_heading,
            })

            # paragraph 분할: 빈 줄 기준 단락 구분
            raw_paras = [p.strip() for p in part_text.split("\n\n") if p.strip()]
            if not raw_paras:
                raw_paras = [part_text]

            # 단락이 너무 길면 단어 수 기준 재분할
            flat_paras: list[str] = []
            for rp in raw_paras:
                flat_paras.extend(_split_section_by_words(rp, _PARA_MAX_WORDS))

            para_idx = len(paragraph_chunks)
            for pi, para_text in enumerate(flat_paras):
                if not para_text.strip():
                    continue
                # Contextual 헤더 프리펜드
                contextualized = f"[문서: {filename} | 섹션: {part_heading}]\n{para_text}"
                paragraph_chunks.append({
                    "id": f"{doc_id}_paragraph_{para_idx + pi}",
                    "doc_id": doc_id,
                    "text": contextualized,
                    "level": "paragraph",
                    "parent_id": sec_chunk_id,
                    "chunk_index": para_idx + pi,
                    "filename": filename,
                })

            sec_idx += 1
        return sec_idx

    sec_idx = 0
    for page_text in pages:
        lines = page_text.splitlines()
        for line in lines:
            if _detect_heading(line):
                # 이전 섹션 flush
                sec_idx = _flush_section(current_heading, current_lines, sec_idx)
                current_heading = line.strip()
                current_lines = []
            else:
                current_lines.append(line)

    # 마지막 섹션 flush
    _flush_section(current_heading, current_lines, sec_idx)

    return section_chunks, paragraph_chunks


# ---------------------------------------------------------------------------
# SQLite 저장
# ---------------------------------------------------------------------------

def _save_document(
    doc_id: str,
    filename: str,
    file_hash: str,
    chunk_count: int,
    section_chunks: list[dict],
    folder: str,
) -> None:
    """documents 테이블 + section chunks → SQLite 저장."""
    conn = get_sqlite()

    conn.execute(
        "INSERT INTO documents(id, filename, file_hash, chunk_count, folder) VALUES(?,?,?,?,?)",
        (doc_id, filename, file_hash, chunk_count, folder),
    )

    # 섹션 청크는 SQLite chunks 테이블에만 저장
    conn.executemany(
        "INSERT INTO chunks(id, doc_id, text, level, parent_id, chunk_index) VALUES(?,?,?,?,?,?)",
        [
            (
                c["id"],
                c["doc_id"],
                c["text"],
                c["level"],
                c.get("parent_id"),
                c.get("chunk_index", 0),
            )
            for c in section_chunks
        ],
    )
    conn.commit()


def _get_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _check_duplicate(file_hash: str) -> dict | None:
    """file_hash로 기존 문서 조회. 없으면 None."""
    conn = get_sqlite()
    row = conn.execute(
        "SELECT id, filename, chunk_count, folder FROM documents WHERE file_hash=?",
        (file_hash,),
    ).fetchone()
    if row:
        return {
            "doc_id": row[0],
            "filename": row[1],
            "chunk_count": row[2],
            "folder": row[3] or "",
        }
    return None


# ---------------------------------------------------------------------------
# 공개 인터페이스
# ---------------------------------------------------------------------------

async def ingest_pdf(
    filename: str,
    content: bytes,
    folder: str = "",
) -> AsyncGenerator[str, None]:
    """
    PDF 인제스트 SSE 스트림.

    각 yield: "data: {json}\n\n" 형식
    마지막 yield: type="done" + IngestResponse 필드
    """

    def _sse(payload: dict) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    # None 방어 (Chroma metadata에 None 저장 금지)
    folder = folder or ""

    # 1. 중복 확인
    file_hash = _get_file_hash(content)
    existing = _check_duplicate(file_hash)
    if existing:
        logger.info("duplicate_doc", filename=filename, doc_id=existing["doc_id"])
        yield _sse({
            "type": "done",
            "doc_id": existing["doc_id"],
            "filename": existing["filename"],
            "chunk_count": existing["chunk_count"],
            "folder": existing.get("folder", ""),
            "status": "duplicate",
        })
        return

    yield _sse({"type": "progress", "message": "파싱 중..."})

    # 2. 텍스트 추출 (blocking → executor)
    try:
        pages = await asyncio.get_event_loop().run_in_executor(
            None, _extract_text, content
        )
    except ValueError as e:
        yield _sse({"type": "error", "message": str(e)})
        return

    # 2-1. 텍스트 레이어 없음 → OCR 폴백 (스캔 PDF)
    if not pages:
        yield _sse({"type": "progress", "message": "OCR 처리 중... (스캔 PDF 감지됨)"})
        try:
            pages = await asyncio.get_event_loop().run_in_executor(
                None, _extract_text_ocr, content
            )
        except Exception as e:
            logger.error("ocr_failed", error=str(e))
            yield _sse({"type": "error", "message": "OCR 처리 실패: Tesseract OCR이 설치되어 있는지 확인하세요."})
            return

        if not pages:
            yield _sse({"type": "error", "message": "PDF 텍스트 추출 실패: 이미지 품질이 너무 낮거나 텍스트가 없는 문서입니다."})
            return

    # 3. 계층적 청킹
    doc_id = str(uuid.uuid4())
    section_chunks, paragraph_chunks = await asyncio.get_event_loop().run_in_executor(
        None, _chunk_pages_hierarchical, pages, filename, doc_id
    )

    # folder는 청크 메타데이터에 일괄 주입 (upsert_chunks에서 Chroma metadata로 기록)
    for c in paragraph_chunks:
        c["folder"] = folder

    total_para = len(paragraph_chunks)
    logger.info(
        "chunking_done",
        doc_id=doc_id,
        sections=len(section_chunks),
        paragraphs=total_para,
    )

    yield _sse({"type": "progress", "message": f"임베딩 중... (0/{total_para} 청크)"})

    # 4. SQLite documents + section 청크 먼저 저장 (paragraph FK 참조 전 필요)
    await asyncio.get_event_loop().run_in_executor(
        None,
        _save_document,
        doc_id,
        filename,
        file_hash,
        total_para,
        section_chunks,
        folder,
    )

    # 5. paragraph 청크 임베딩 + upsert (blocking)
    BATCH = 32
    processed = 0
    for i in range(0, total_para, BATCH):
        batch = paragraph_chunks[i : i + BATCH]
        await asyncio.get_event_loop().run_in_executor(None, upsert_chunks, batch)
        processed += len(batch)
        yield _sse({
            "type": "progress",
            "message": f"임베딩 중... ({processed}/{total_para} 청크)",
        })

    # 5.5. 엔티티 추출 + SQLite 저장
    all_text = "\n".join(p["text"] for p in paragraph_chunks)
    entities = extract_entities(all_text, doc_id)
    if entities:
        conn = get_sqlite()
        conn.executemany(
            "INSERT OR IGNORE INTO doc_entities(id, doc_id, entity_type, value, context, chunk_id)"
            " VALUES(?,?,?,?,?,?)",
            [(e["id"], e["doc_id"], e["entity_type"], e["value"], e["context"], e["chunk_id"])
             for e in entities],
        )
        conn.execute(
            "UPDATE documents SET migration_status='done' WHERE id=?", (doc_id,)
        )
        conn.commit()
        logger.info("entities_extracted", doc_id=doc_id, count=len(entities))

    # 6. 백그라운드 온톨로지 큐잉
    get_scheduler().enqueue_ontology(doc_id, paragraph_chunks)

    logger.info("ingest_done", doc_id=doc_id, filename=filename, chunks=total_para)

    yield _sse({
        "type": "done",
        "doc_id": doc_id,
        "filename": filename,
        "chunk_count": total_para,
        "status": "indexed",
        "folder": folder,
    })


def list_documents() -> list[dict]:
    """저장된 문서 목록 반환."""
    conn = get_sqlite()
    rows = conn.execute(
        "SELECT id, filename, chunk_count, ingested_at, folder FROM documents ORDER BY ingested_at DESC"
    ).fetchall()
    return [
        {
            "doc_id": r[0],
            "filename": r[1],
            "chunk_count": r[2],
            "ingested_at": r[3],
            "folder": r[4] or "",
        }
        for r in rows
    ]


def delete_document(doc_id: str) -> bool:
    """문서 + 관련 벡터 전체 삭제. 성공 시 True."""
    from app.services.vector_store import delete_doc_vectors

    conn = get_sqlite()
    row = conn.execute("SELECT id FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        return False

    # 1. FTS5 먼저 삭제 (virtual table은 CASCADE 미적용)
    conn.execute(
        "DELETE FROM chunks_fts WHERE id IN (SELECT id FROM chunks WHERE doc_id=?)",
        (doc_id,),
    )
    # 2. documents 삭제 (FOREIGN KEY CASCADE로 chunks 자동 삭제)
    conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
    conn.commit()

    # 3. ChromaDB 벡터 삭제 (SQLite 커밋 이후 — 실패해도 메타데이터는 이미 제거됨)
    # delete_doc_vectors 내부의 SQLite chunks/FTS 중복 삭제는 0행 영향이므로 무해함
    try:
        delete_doc_vectors(doc_id)
    except Exception as e:
        logger.warning("chroma_delete_failure", doc_id=doc_id, error=str(e))

    logger.info("delete_document", doc_id=doc_id)
    return True
