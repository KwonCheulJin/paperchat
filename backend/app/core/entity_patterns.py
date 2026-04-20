"""
엔티티 추출 패턴 및 쿼리 의도 분류.

- classify_query_intent: 열거/사실 Q&A 구분
- detect_entity_type: 이슈번호/날짜 등 엔티티 타입 감지
- detect_doc_scope: 질문에서 특정 문서 파일명 감지
- extract_entities: 텍스트 → regex 추출 → doc_entities 행 리스트
- query_doc_entities: SQLite doc_entities 페이지 조회
- format_entity_response / format_empty_entity_message: SSE 이벤트 포맷
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# 패턴
# ---------------------------------------------------------------------------

ENTITY_PATTERNS: dict[str, list[str]] = {
    "issue_number": [
        r"[A-Z]+-\d{7,}",   # DEFC-0000001552
        r"[A-Z]+-\d{3,}",   # PROJ-123
    ],
    "date": [
        r"\d{4}[./\-]\d{2}[./\-]\d{2}",
    ],
}

_ENTITY_TYPE_LABELS: dict[str, str] = {
    "issue_number": "이슈 번호",
    "date": "날짜",
}

# ---------------------------------------------------------------------------
# 쿼리 의도 분류
# ---------------------------------------------------------------------------

_ENUM_KEYWORDS = frozenset({
    "모두", "전부", "정리", "목록", "리스트", "전체", "나열", "취합", "추출", "뽑아",
})

# 질문에 특정 엔티티 값이 포함되면 factual로 처리 (열거 키워드가 있어도 override)
_SPECIFIC_ENTITY_RE = re.compile(r"[A-Z]+-\d{3,}")


def classify_query_intent(question: str) -> str:
    """열거 의도 여부 반환. 'enumeration' | 'factual'

    특정 이슈번호(DEFC-0000001701 등)가 포함된 질문은 개별 조회이므로 factual.
    """
    if _SPECIFIC_ENTITY_RE.search(question):
        return "factual"
    for kw in _ENUM_KEYWORDS:
        if kw in question:
            return "enumeration"
    return "factual"


# ---------------------------------------------------------------------------
# 엔티티 타입 감지
# ---------------------------------------------------------------------------

_ISSUE_KEYWORDS = frozenset({"이슈", "번호", "DEFC", "PROJ", "티켓", "이슈번호"})
_DATE_KEYWORDS = frozenset({"날짜", "일자", "기간", "일시", "연도"})


def detect_entity_type(question: str) -> str | None:
    """질문에서 엔티티 타입 추론. None이면 미분류."""
    for kw in _ISSUE_KEYWORDS:
        if kw in question:
            return "issue_number"
    for kw in _DATE_KEYWORDS:
        if kw in question:
            return "date"
    return None


# ---------------------------------------------------------------------------
# 문서 스코프 감지
# ---------------------------------------------------------------------------

def detect_doc_scope(question: str, folder: str) -> str | None:
    """질문에 파일명 스템이 포함된 문서의 doc_id 반환. 없으면 None."""
    from app.core.db import get_sqlite
    conn = get_sqlite()
    rows = conn.execute(
        "SELECT id, filename FROM documents WHERE folder=?", (folder or "",)
    ).fetchall()
    q_lower = question.lower()
    for doc_id, filename in rows:
        stem = filename.lower().replace(".pdf", "").strip()
        if stem and stem in q_lower:
            return doc_id
    return None


# ---------------------------------------------------------------------------
# EntityPage 데이터 클래스
# ---------------------------------------------------------------------------

PAGE_SIZE = 50


@dataclass
class EntityPage:
    items: list[dict]        # [{value, context, doc_id, filename}, ...]
    total_count: int
    next_offset: int         # items 수신 완료 후 다음 offset
    has_more: bool
    entity_type: str
    folder: str
    doc_id: str | None


# ---------------------------------------------------------------------------
# DB 쿼리
# ---------------------------------------------------------------------------

def query_doc_entities(
    folder: str,
    entity_type: str,
    doc_id: str | None = None,
    offset: int = 0,
    limit: int = PAGE_SIZE,
) -> EntityPage:
    """doc_entities 테이블에서 페이지 단위로 조회."""
    from app.core.db import get_sqlite
    conn = get_sqlite()

    if doc_id:
        total: int = conn.execute(
            "SELECT COUNT(*) FROM doc_entities WHERE doc_id=? AND entity_type=?",
            (doc_id, entity_type),
        ).fetchone()[0]
        rows = conn.execute(
            """SELECT de.value, de.context, de.doc_id, d.filename
               FROM doc_entities de JOIN documents d ON de.doc_id=d.id
               WHERE de.doc_id=? AND de.entity_type=?
               ORDER BY de.value LIMIT ? OFFSET ?""",
            (doc_id, entity_type, limit, offset),
        ).fetchall()
    else:
        total = conn.execute(
            """SELECT COUNT(*) FROM doc_entities de
               JOIN documents d ON de.doc_id=d.id
               WHERE d.folder=? AND de.entity_type=?""",
            (folder or "", entity_type),
        ).fetchone()[0]
        rows = conn.execute(
            """SELECT de.value, de.context, de.doc_id, d.filename
               FROM doc_entities de JOIN documents d ON de.doc_id=d.id
               WHERE d.folder=? AND de.entity_type=?
               ORDER BY de.value LIMIT ? OFFSET ?""",
            (folder or "", entity_type, limit, offset),
        ).fetchall()

    items = [
        {"value": r[0], "context": r[1], "doc_id": r[2], "filename": r[3]}
        for r in rows
    ]
    next_offset = offset + len(items)
    return EntityPage(
        items=items,
        total_count=total,
        next_offset=next_offset,
        has_more=next_offset < total,
        entity_type=entity_type,
        folder=folder or "",
        doc_id=doc_id,
    )


# ---------------------------------------------------------------------------
# 엔티티 추출 (인제스트 시 호출)
# ---------------------------------------------------------------------------

def extract_entities(text: str, doc_id: str, chunk_id: str | None = None) -> list[dict]:
    """텍스트 → regex 추출 → doc_entities 행 리스트."""
    results: list[dict] = []
    for entity_type, patterns in ENTITY_PATTERNS.items():
        seen: set[str] = set()
        for pattern in patterns:
            for m in re.finditer(pattern, text):
                value = m.group()
                if value in seen:
                    continue
                seen.add(value)
                start = max(0, m.start() - 25)
                end = min(len(text), m.end() + 25)
                context = text[start:end].replace("\n", " ").strip()
                results.append({
                    "id": str(uuid.uuid4()),
                    "doc_id": doc_id,
                    "entity_type": entity_type,
                    "value": value,
                    "context": context[:100],
                    "chunk_id": chunk_id,
                })
    return results


# ---------------------------------------------------------------------------
# SSE 포맷 헬퍼
# ---------------------------------------------------------------------------

def format_entity_response(page: EntityPage) -> dict:
    label = _ENTITY_TYPE_LABELS.get(page.entity_type, page.entity_type)
    header = f"{label} 목록 ({page.total_count}개)"
    items_text = "\n".join(f"- {item['value']}" for item in page.items)
    content = f"**{header}**\n\n{items_text}"
    return {
        "type": "entity_result",
        "content": content,
        "items": [item["value"] for item in page.items],
        "entity_type": page.entity_type,
        "total_count": page.total_count,
        "has_more": page.has_more,
        "next_offset": page.next_offset,
        "folder": page.folder,
        "doc_id": page.doc_id,
    }


def format_empty_entity_message(entity_type: str) -> dict:
    label = _ENTITY_TYPE_LABELS.get(entity_type, entity_type)
    return {
        "type": "token",
        "content": (
            f"문서에서 {label}을(를) 찾을 수 없습니다. "
            "문서가 인덱싱되지 않았거나 해당 패턴이 없을 수 있습니다.\n\n"
            "관련 내용을 문서에서 직접 검색합니다..."
        ),
    }
