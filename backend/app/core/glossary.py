import functools
import json
import os

_DEFAULT_GLOSSARY: dict[str, list[str]] = {
    "KPI": ["핵심성과지표", "성과 지표", "key performance indicator"],
    "OKR": ["목표와 핵심 결과", "목표 및 핵심결과"],
    "ROI": ["투자수익률", "투자 대비 수익"],
    "매출": ["revenue", "sales", "수익"],
    "비용": ["cost", "expense", "지출"],
}

GLOSSARY_PATH = os.path.join(os.path.dirname(__file__), "glossary.json")


@functools.cache
def load_glossary() -> dict[str, list[str]]:
    """{"KPI": ["핵심성과지표", ...], ...} 형태의 용어 사전 반환. 파일 I/O 1회만 실행."""
    if os.path.exists(GLOSSARY_PATH):
        try:
            with open(GLOSSARY_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return _DEFAULT_GLOSSARY


def expand_query(question: str) -> str:
    """질문에 포함된 용어의 동의어를 추가하여 검색 범위 확대."""
    glossary = load_glossary()
    additions: set[str] = set()
    for term, synonyms in glossary.items():
        if term.lower() in question.lower():
            additions.update(synonyms)
        else:
            for syn in synonyms:
                if syn.lower() in question.lower():
                    additions.add(term)
                    break
    if additions:
        return question + " " + " ".join(sorted(additions))
    return question
