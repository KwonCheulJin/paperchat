"""Document 도메인 Port 인터페이스."""
from abc import ABC, abstractmethod


class PDFParserPort(ABC):
    """PDF 텍스트 추출 Port."""

    @abstractmethod
    def extract(self, content: bytes) -> list[str]: ...

    @abstractmethod
    def extract_ocr(self, content: bytes) -> list[str]: ...
