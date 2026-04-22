"""PDF 텍스트 추출 모듈."""
from __future__ import annotations

from app.core.logging_config import get_logger

logger = get_logger(__name__)


def _extract_text_pymupdf(content: bytes) -> list[str]:
    """PyMuPDF로 페이지별 텍스트 추출. 표는 Markdown으로 별도 추출."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=content, filetype="pdf")
    pages: list[str] = []
    for page in doc:
        parts: list[str] = []

        # 표 영역 감지 → Markdown 변환
        try:
            tabs = page.find_tables()
            for tab in tabs:
                rows = tab.extract()
                if rows:
                    cells_rows = []
                    for i, row in enumerate(rows):
                        cells = [str(c or "").strip().replace("\n", " ") for c in row]
                        cells_rows.append("| " + " | ".join(cells) + " |")
                        if i == 0:
                            cells_rows.append("| " + " | ".join(["---"] * len(cells)) + " |")
                    parts.append("\n".join(cells_rows))
        except Exception:
            pass  # 표 감지 실패 시 무시

        text = page.get_text("text")
        if text.strip():
            parts.append(text)

        combined = "\n\n".join(parts)
        if combined.strip():
            pages.append(combined)
    doc.close()
    return pages


def _find_tesseract_cmd() -> str | None:
    """Tesseract 실행 파일 경로 탐색.

    우선순위:
    1. TESSERACT_CMD 환경 변수 (Tauri에서 주입)
    2. Windows 기본 설치 경로
    3. PATH 탐색 (shutil.which)
    """
    import os, sys, shutil
    env_path = os.environ.get("TESSERACT_CMD")
    if env_path and os.path.exists(env_path):
        return env_path
    if sys.platform == "win32":
        candidates = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for path in candidates:
            if os.path.exists(path):
                return path
    which = shutil.which("tesseract")
    if which:
        return which
    return None


def _find_tessdata_dir() -> str | None:
    """tessdata 디렉토리 경로 탐색.

    우선순위:
    1. TESSDATA_PREFIX 환경 변수
    2. APPDATA\\paperchat\\tessdata (Tauri가 복사한 위치, 관리자 권한 불필요)
    3. 표준 Tesseract 설치 경로의 tessdata
    """
    import os
    env_dir = os.environ.get("TESSDATA_PREFIX")
    if env_dir and os.path.isdir(env_dir):
        return env_dir
    appdata = os.environ.get("APPDATA", "")
    if appdata:
        path = os.path.join(appdata, "paperchat", "tessdata")
        if os.path.exists(os.path.join(path, "kor.traineddata")):
            return path
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tessdata",
        r"C:\Program Files (x86)\Tesseract-OCR\tessdata",
    ]
    for path in candidates:
        if os.path.isdir(path):
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

    # tessdata 경로는 TESSDATA_PREFIX 환경변수로 전달 — --tessdata-dir CLI 인자는
    # Windows에서 quote 처리·경로 구분자 이슈로 간헐 실패함. env var가 가장 안정적.
    tessdata_dir = _find_tessdata_dir()
    if tessdata_dir:
        os.environ["TESSDATA_PREFIX"] = tessdata_dir

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


def _table_to_markdown(table: list[list]) -> str:
    """pdfplumber 표를 Markdown 테이블 문자열로 변환."""
    if not table:
        return ""
    rows = []
    for i, row in enumerate(table):
        cells = [str(c or "").strip().replace("\n", " ") for c in row]
        rows.append("| " + " | ".join(cells) + " |")
        if i == 0:
            rows.append("| " + " | ".join(["---"] * len(cells)) + " |")
    return "\n".join(rows)


def _extract_text_pdfplumber(content: bytes) -> list[str]:
    """pdfplumber 폴백 — PyMuPDF 실패 시 사용. 표는 Markdown으로 별도 추출."""
    import io
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            parts: list[str] = []

            # 표 영역 먼저 추출 — Markdown 변환 후 본문과 분리
            tables = page.extract_tables() or []
            for table in tables:
                md = _table_to_markdown(table)
                if md:
                    parts.append(md)

            text = page.extract_text() or ""
            if text.strip():
                parts.append(text)

            combined = "\n\n".join(parts)
            if combined.strip():
                pages.append(combined)
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
