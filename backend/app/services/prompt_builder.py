"""
프로필 기반 시스템 프롬프트 빌더.

프로필 JSON 구조:
{
  "name": "private-equity",
  "role": "사모펀드 투자 분석 AI",
  "language": "ko",
  "temperature": 0.1,
  "system_prompt_template": "...",
  "few_shots": [...],
  "deny_conditions": [...]
}
"""
import json
import os
from functools import lru_cache
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# backend/profiles/ 기준 절대 경로
PROFILES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "profiles")

# 기본 프로필 (파일 없을 때 사용)
_DEFAULT_PROFILE: dict = {
    "name": "internal-general",
    "role": "문서 분석 AI",
    "language": "ko",
    "temperature": 0.1,
    "system_prompt_template": (
        "당신은 문서 기반 질의응답 AI입니다. "
        "제공된 문서만을 근거로 답변하며, 문서에 없는 내용은 '문서에서 확인되지 않음'이라고 명시합니다.\n\n"
        "{context}"
    ),
    "few_shots": [],
    "deny_conditions": [],
}


@lru_cache(maxsize=16)
def load_profile(profile_name: str) -> dict:
    """backend/profiles/{profile_name}.json 로드. 없으면 internal-general 사용."""
    profile_path = os.path.join(PROFILES_DIR, f"{profile_name}.json")

    try:
        with open(profile_path, encoding="utf-8") as f:
            profile = json.load(f)
            logger.info("profile_loaded", name=profile_name)
            return profile
    except FileNotFoundError:
        logger.warning("profile_not_found", name=profile_name, fallback="internal-general")

    # internal-general.json 시도
    general_path = os.path.join(PROFILES_DIR, "internal-general.json")
    try:
        with open(general_path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("internal_general_not_found", using="default")
        return dict(_DEFAULT_PROFILE)


def build_system_prompt(profile: dict, context: str) -> str:
    """
    시스템 프롬프트 생성:
    1. profile["system_prompt_template"] 기반
    2. context (Spotlighting된 문서 텍스트) 삽입
    3. deny_conditions 추가
    4. few_shots 포함
    반환: 완성된 시스템 프롬프트 문자열
    """
    template: str = profile.get(
        "system_prompt_template",
        _DEFAULT_PROFILE["system_prompt_template"],
    )

    # {context} 자리에 Spotlighting된 문서 삽입
    system_prompt = template.replace("{context}", context)

    # deny_conditions 추가
    deny_conditions: list[str] = profile.get("deny_conditions", [])
    if deny_conditions:
        deny_text = "\n".join(f"- {cond}" for cond in deny_conditions)
        system_prompt += f"\n\n[제한 사항]\n{deny_text}"

    # few_shots 추가
    few_shots: list[dict] = profile.get("few_shots", [])
    if few_shots:
        examples = []
        for shot in few_shots:
            q = shot.get("question", "")
            a = shot.get("answer", "")
            if q and a:
                examples.append(f"Q: {q}\nA: {a}")
        if examples:
            system_prompt += "\n\n[예시]\n" + "\n\n".join(examples)

    return system_prompt


def get_temperature(profile: dict) -> float:
    """프로필에서 temperature 반환. 기본값 0.1."""
    return float(profile.get("temperature", 0.1))
