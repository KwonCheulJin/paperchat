"""
Spotlighting + 출력 검증.

Spotlighting: 문서 청크를 XML 태그로 래핑하여 LLM이 명령으로 오해하지 않도록 함.
출력 검증: 시스템 프롬프트 유출, 내부 경로, 명령형 패턴 탐지.
"""
import re
import unicodedata

# 프롬프트 인젝션 탐지 패턴 (한국어 + 영어)
_INJECTION_PATTERNS = [
    r"무시하라",
    r"무시해",
    r"ignore\s+previous",
    r"ignore\s+above",
    r"forget\s+(everything|all|previous|above)",
    r"disregard",
    r"override",
    r"(?i)system\s*:",
    r"(?i)assistant\s*:",
    r"(?i)\[system\]",
    r"(?i)\[assistant\]",
    r"새로운\s+지시",
    r"지시\s*사항\s*무시",
    r"이전\s+명령\s*무시",
    r"(?i)jailbreak",
    r"(?i)prompt\s+injection",
]

# 내부 경로 패턴
_PATH_PATTERNS = [
    r"[A-Za-z]:\\[^\s]{3,}",   # Windows 경로: C:\...
    r"/home/[^\s]+",            # Linux home
    r"/Users/[^\s]+",           # macOS Users
    r"/root/[^\s]+",            # Linux root
    r"/var/[^\s]+",             # Linux var
    r"/tmp/[^\s]+",             # Linux tmp
    r"/etc/[^\s]+",             # Linux etc
]

# 시스템 프롬프트 유출 탐지 패턴
_SYSTEM_LEAK_PATTERNS = [
    r"(?i)you\s+are\s+an?\s+ai",
    r"(?i)your\s+system\s+prompt",
    r"(?i)as\s+instructed",
    r"deny_condition",
    r"system_prompt_template",
    r"few_shots",
]


def spotlight_chunks(chunks: list[dict]) -> str:
    """
    chunks를 <DOCUMENT> 태그로 래핑한 문자열 반환.
    각 chunk: {"text", "filename", "page"(optional)}

    출력 형식:
    <DOCUMENT source="파일명" page="1">
    청크 텍스트
    </DOCUMENT>
    """
    parts = []
    for chunk in chunks:
        filename = chunk.get("filename", "unknown")
        page = chunk.get("page", "")
        text = chunk.get("text", "")

        if page:
            tag = f'<DOCUMENT source="{filename}" page="{page}">'
        else:
            tag = f'<DOCUMENT source="{filename}">'

        parts.append(f"{tag}\n{text}\n</DOCUMENT>")

    return "\n\n".join(parts)


def check_injection(text: str) -> bool:
    """
    사용자 입력에서 프롬프트 인젝션 패턴 탐지.
    탐지 시 True 반환.
    """
    # Zero-Width 문자 등 유니코드 우회 방지
    normalized = unicodedata.normalize("NFKC", text)
    for pattern in _INJECTION_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            return True
    return False


def validate_output(text: str) -> str:
    """
    LLM 출력에서 민감 정보 제거.
    - 내부 경로 패턴 (C:\\, /home/, /Users/ 등)
    - <reasoning> 태그 및 내용 제거 (CoT Light)
    - 시스템 프롬프트 유출 패턴 탐지 시 경고 추가
    반환: 정제된 텍스트
    """
    # <reasoning>...</reasoning> 블록 제거 (멀티라인 포함)
    text = re.sub(r"<reasoning>.*?</reasoning>", "", text, flags=re.DOTALL | re.IGNORECASE)

    # 내부 경로 마스킹
    for pattern in _PATH_PATTERNS:
        text = re.sub(pattern, "[경로 삭제됨]", text)

    # 시스템 프롬프트 유출 탐지 후 경고 추가
    leaked = any(re.search(p, text, re.IGNORECASE) for p in _SYSTEM_LEAK_PATTERNS)
    if leaked:
        text = "[주의: 내부 설정 정보가 포함된 응답이 감지되었습니다.]\n\n" + text

    return text.strip()
