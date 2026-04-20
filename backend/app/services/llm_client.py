"""
llama-server OpenAI 호환 클라이언트.
llama-server는 /v1/chat/completions 엔드포인트를 제공한다.
KV Q4 + Flash Attention + Prompt Caching은 llama-server 시작 옵션에서 설정.

연결 풀: 모듈 레벨 AsyncClient 싱글톤을 재사용해 TCP 핸드셰이크 오버헤드를 제거한다.
lifespan 종료 시 close_http_client()를 호출해 정리한다.
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

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _http_client


async def close_http_client() -> None:
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.ConnectError)),
    reraise=True,
)
async def health_check() -> bool:
    """llama-server 실행 여부 확인."""
    client = get_http_client()
    resp = await client.get(f"{settings.llama_server_url}{HEALTH_ENDPOINT}", timeout=5.0)
    return resp.status_code == 200


async def stream_chat(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int = 512,
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
        client = get_http_client()
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
    client = get_http_client()
    resp = await client.post(
        f"{settings.llama_server_url}{CHAT_ENDPOINT}",
        json=payload,
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
