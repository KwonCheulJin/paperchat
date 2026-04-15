"""
llama-server OpenAI 호환 클라이언트.
llama-server는 /v1/chat/completions 엔드포인트를 제공한다.
KV Q4 + Flash Attention + Prompt Caching은 llama-server 시작 옵션에서 설정.
"""
import json
from typing import AsyncGenerator
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

CHAT_ENDPOINT = "/v1/chat/completions"
EMBED_ENDPOINT = "/v1/embeddings"
HEALTH_ENDPOINT = "/health"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
    reraise=True,
)
async def health_check() -> bool:
    """llama-server 실행 여부 확인."""
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(f"{settings.llama_server_url}{HEALTH_ENDPOINT}")
        return resp.status_code == 200


async def stream_chat(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 2048,
    stop_sequences: list[str] | None = None,
) -> AsyncGenerator[str, None]:
    """
    llama-server /v1/chat/completions 스트리밍 호출.
    각 토큰을 yield. 완료 시 None yield.
    """
    payload = {
        "model": settings.llama_model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if stop_sequences:
        payload["stop"] = stop_sequences

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{settings.llama_server_url}{CHAT_ENDPOINT}",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        raise RuntimeError("llama-server에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
    reraise=True,
)
async def chat_once(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 512,
) -> str:
    """단발성 채팅 (제목 생성 등에 사용)."""
    payload = {
        "model": settings.llama_model,
        "messages": messages,
        "stream": False,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.llama_server_url}{CHAT_ENDPOINT}",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
