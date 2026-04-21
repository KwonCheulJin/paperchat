"""
chunker 단위 테스트 — 인프라 의존 없음.
"""
import pytest
from app.domain.document.chunker import (
    _chunk_pages_hierarchical,
    _detect_heading,
    _split_section_by_words,
)


class TestDetectHeading:
    def test_korean_clause_detected(self):
        assert _detect_heading("제1조 목적") is True

    def test_korean_item_detected(self):
        assert _detect_heading("가. 일반 사항") is True

    def test_numbered_item_detected(self):
        assert _detect_heading("1) 개요") is True

    def test_parenthetical_item_detected(self):
        assert _detect_heading("(가) 세부 사항") is True

    def test_numeric_section_detected(self):
        assert _detect_heading("1. 서론") is True

    def test_long_line_not_heading(self):
        long = "이것은 매우 긴 줄로 헤딩이 아닌 일반 본문 텍스트입니다. " * 3
        assert _detect_heading(long) is False

    def test_period_ending_not_heading(self):
        assert _detect_heading("일반 문장입니다.") is False

    def test_empty_not_heading(self):
        assert _detect_heading("") is False

    def test_comma_ending_not_heading(self):
        assert _detect_heading("항목 1,") is False


class TestSplitSectionByWords:
    def test_short_text_unchanged(self):
        text = "짧은 텍스트"
        result = _split_section_by_words(text, max_words=50)
        assert result == [text]

    def test_long_text_split(self):
        words = ["단어"] * 300
        text = " ".join(words)
        result = _split_section_by_words(text, max_words=100)
        assert len(result) == 3
        for chunk in result:
            assert len(chunk.split()) <= 100

    def test_exact_boundary_no_split(self):
        words = ["단어"] * 50
        text = " ".join(words)
        result = _split_section_by_words(text, max_words=50)
        assert len(result) == 1


class TestChunkPagesHierarchical:
    def test_basic_chunking_returns_both_levels(self):
        pages = ["1. 서론\n이 문서는 테스트입니다.\n\n계속 내용이 있습니다."]
        sec, para = _chunk_pages_hierarchical(pages, "test.pdf", "doc-1")
        assert len(sec) >= 1
        assert len(para) >= 1

    def test_section_ids_prefixed_with_doc_id(self):
        pages = ["본문 내용입니다."]
        sec, para = _chunk_pages_hierarchical(pages, "test.pdf", "doc-xyz")
        assert all(c["id"].startswith("doc-xyz") for c in sec)
        assert all(c["id"].startswith("doc-xyz") for c in para)

    def test_paragraph_has_parent_id(self):
        pages = ["1. 섹션\n단락 내용입니다."]
        sec, para = _chunk_pages_hierarchical(pages, "test.pdf", "doc-1")
        assert all(c["parent_id"] is not None for c in para)

    def test_paragraph_level_is_paragraph(self):
        pages = ["내용"]
        _, para = _chunk_pages_hierarchical(pages, "test.pdf", "doc-1")
        assert all(c["level"] == "paragraph" for c in para)

    def test_section_level_is_section(self):
        pages = ["내용"]
        sec, _ = _chunk_pages_hierarchical(pages, "test.pdf", "doc-1")
        assert all(c["level"] == "section" for c in sec)

    def test_empty_pages_returns_empty(self):
        sec, para = _chunk_pages_hierarchical([], "test.pdf", "doc-1")
        assert sec == []
        assert para == []

    def test_contextual_header_prepended(self):
        pages = ["1. 서론\n내용"]
        _, para = _chunk_pages_hierarchical(pages, "report.pdf", "doc-1")
        assert any("[문서: report.pdf" in c["text"] for c in para)

    def test_fts_text_no_header(self):
        pages = ["1. 서론\n순수 본문"]
        _, para = _chunk_pages_hierarchical(pages, "report.pdf", "doc-1")
        # fts_text에는 contextual 헤더가 없어야 함
        assert any("[문서:" not in c.get("fts_text", "") for c in para)

    def test_multiple_pages_with_headings_produce_multiple_sections(self):
        pages = ["1. 서론\n첫 번째 내용", "2. 본론\n두 번째 내용"]
        sec, para = _chunk_pages_hierarchical(pages, "test.pdf", "doc-1")
        assert len(sec) >= 2
        assert len(para) >= 2
