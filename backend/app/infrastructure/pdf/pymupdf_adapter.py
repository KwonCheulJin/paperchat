"""PDF parser → PDFParserPort 어댑터."""
from app.domain.document.ports import PDFParserPort
from app.domain.document.parser import _extract_text, _extract_text_ocr


class PyMuPDFAdapter(PDFParserPort):
    def extract(self, content: bytes) -> list[str]:
        return _extract_text(content)

    def extract_ocr(self, content: bytes) -> list[str]:
        return _extract_text_ocr(content)
