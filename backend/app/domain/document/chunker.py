"""계층적 청킹 모듈 — 텍스트 페이지 → section + paragraph 청크."""
from __future__ import annotations

import re

# 섹션 분할 기준 단어 수
_SECTION_MAX_WORDS = 200
# paragraph 기준 단어 수
_PARA_MAX_WORDS = 150

# 한국어 헤딩 패턴: 제N조/항/장, 가./나., 1), (가), (1) 등
_KO_HEADING_RE = re.compile(
    r"^("
    r"제\s*\d+\s*[조항장절]"      # 제1조, 제2항, 제3장, 제4절
    r"|[가-힣]\."                  # 가. 나. 다.
    r"|\d+\)"                      # 1) 2) 3)
    r"|\([가-힣]\)"                # (가) (나) (다)
    r"|\([0-9]+\)"                 # (1) (2) (3)
    r")"
)


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
    """헤딩 감지: 60자 이하, 마침표/쉼표 미종결, 헤딩 패턴 매칭."""
    stripped = line.strip()
    if not stripped:
        return False
    if len(stripped) > 60:
        return False
    if stripped.endswith(".") or stripped.endswith(","):
        return False

    # 한국어 헤딩 패턴 (제N조/항/장/절, 가., 1), (가), (1))
    if _KO_HEADING_RE.match(stripped):
        return True

    # 숫자로 시작하는 목차 패턴 (1. / 1.1 / Chapter 1)
    first_word = stripped.split()[0] if stripped.split() else ""
    if first_word.rstrip(".").replace(".", "").isdigit():
        return True

    # 영문 대문자 시작 + 짧은 줄 (한국어 미적용 — isupper()는 한글 False)
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
                # Contextual 헤더 프리펜드 (dense 검색용)
                contextualized = f"[문서: {filename} | 섹션: {part_heading}]\n{para_text}"
                paragraph_chunks.append({
                    "id": f"{doc_id}_paragraph_{para_idx + pi}",
                    "doc_id": doc_id,
                    "text": contextualized,
                    "fts_text": para_text,  # FTS5에는 헤더 없는 순수 본문만 저장
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
