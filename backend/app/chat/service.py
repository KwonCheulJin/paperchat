"""
채팅 RAG 파이프라인.

파이프라인:
1. PriorityScheduler.notify_chat() — 온톨로지 추출 일시정지
2. SemanticCache 조회 (cosine ≥ 0.95 → 즉시 반환)
3. Hybrid Search (BGE-M3 dense + BM25 FTS5 → RRF → top-50)
4. Cross-Encoder Rerank → top-3
5. 부모 섹션 텍스트 확장
6. Spotlighting (DOCUMENT 태그 래핑)
7. 프로필 기반 시스템 프롬프트 구성
8. llama-server 스트리밍 → 토큰 yield
9. 완전한 답변 저장 → SemanticCache.put()
"""
from typing import AsyncGenerator
import asyncio
import functools
import json

from app.services.hybrid_search import hybrid_search
from app.services.reranker import rerank
from app.services.vector_store import get_parent_texts
from app.services.injection_guard import spotlight_chunks, check_injection, validate_output
from app.services.prompt_builder import load_profile, build_system_prompt, get_temperature
from app.services.llm_client import stream_chat
from app.services.priority_scheduler import get_scheduler
from app.services.semantic_cache import get_cache
from app.core.logging_config import get_logger
from app.core.entity_patterns import (
    classify_query_intent,
    detect_entity_type,
    detect_doc_scope,
    query_doc_entities,
    format_entity_response,
    format_empty_entity_message,
)
from app.chat.schemas import ChatRequest

logger = get_logger(__name__)


async def chat_stream(request: ChatRequest) -> AsyncGenerator[str, None]:
    """
    SSE 형식 스트림. 각 토큰 yield.

    yield 형식:
    - 일반 토큰: "data: {"type": "token", "content": "..."}\n\n"
    - 소스 정보: "data: {"type": "sources", "sources": [...]}\n\n"  (스트리밍 시작 전)
    - 완료: "data: {"type": "done", "cached": false}\n\n"
    - 에러: "data: {"type": "error", "message": "..."}\n\n"
    """
    # 마지막 user 메시지 추출
    question = ""
    for msg in reversed(request.messages):
        if msg.role == "user":
            question = msg.content
            break

    # continuation 요청: 엔티티 페이지네이션 (RAG 전체 건너뜀)
    if request.continuation:
        cont = request.continuation
        page = query_doc_entities(
            cont.folder,
            cont.entity_type,
            doc_id=cont.doc_id,
            offset=cont.offset,
        )
        ev = format_entity_response(page)
        yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'cached': False}, ensure_ascii=False)}\n\n"
        return

    if not question:
        yield f"data: {json.dumps({'type': 'error', 'message': '질문이 없습니다.'}, ensure_ascii=False)}\n\n"
        return

    # 1. 인젝션 탐지
    if check_injection(question):
        logger.warning("injection_detected", question=question[:60])
        yield f"data: {json.dumps({'type': 'error', 'message': '허용되지 않는 입력 패턴이 감지되었습니다.'}, ensure_ascii=False)}\n\n"
        return

    # 2. PriorityScheduler 알림 — 온톨로지 추출 일시정지
    get_scheduler().notify_chat()

    # 3. SemanticCache 조회
    cache = get_cache()
    cached_answer = await cache.get(question)
    if cached_answer:
        logger.info("cache_hit_stream", question=question[:40])
        # 캐시 히트 시 토큰 단위로 분할 yield (자연스러운 스트리밍 효과)
        words = cached_answer.split(" ")
        for i, word in enumerate(words):
            token = word if i == 0 else " " + word
            yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'cached': True}, ensure_ascii=False)}\n\n"
        return

    loop = asyncio.get_event_loop()

    # 4. 쿼리 의도 분류 + 엔티티 B-경로
    top_k = 3
    skip_cache = False
    intent = classify_query_intent(question)

    if intent == "enumeration":
        skip_cache = True
        entity_type = detect_entity_type(question)

        if entity_type:
            doc_id = detect_doc_scope(question, request.folder or "")
            page = query_doc_entities(request.folder or "", entity_type, doc_id=doc_id)

            if page.total_count == 0:
                # 빈 결과 → top_k=15 fallback (일반 RAG 계속)
                empty_ev = format_empty_entity_message(entity_type)
                yield f"data: {json.dumps(empty_ev, ensure_ascii=False)}\n\n"
                top_k = 15
            else:
                ev = format_entity_response(page)
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'cached': False}, ensure_ascii=False)}\n\n"
                logger.info("entity_direct_response", entity_type=entity_type, count=page.total_count)
                return
        else:
            top_k = 15

    # 5. Hybrid Search (top-50) — CPU bound, executor로 실행
    try:
        search_results = await loop.run_in_executor(
            None,
            functools.partial(hybrid_search, question, folder=request.folder),
        )
    except Exception as exc:
        logger.error("hybrid_search_failed", error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'message': '검색 중 오류가 발생했습니다.'}, ensure_ascii=False)}\n\n"
        return

    # 6. Cross-Encoder Rerank → top_k (기본 3, 열거 쿼리 15) — CPU bound, executor로 실행
    top_chunks = await loop.run_in_executor(
        None, functools.partial(rerank, question, search_results, top_k=top_k)
    )

    # 7. 부모 섹션 텍스트 확장
    parent_ids = [c["parent_id"] for c in top_chunks if c.get("parent_id")]
    parent_texts: dict[str, str] = {}
    if parent_ids:
        parent_texts = await loop.run_in_executor(None, get_parent_texts, parent_ids)

    # 부모 텍스트가 있으면 chunk 텍스트를 부모 섹션으로 교체 (LLM 컨텍스트 토큰 제한)
    MAX_CHUNK_CHARS = 1200  # 한국어 기준 약 600 토큰
    expanded_chunks = []
    for chunk in top_chunks:
        c = dict(chunk)
        pid = c.get("parent_id", "")
        if pid and pid in parent_texts:
            c["text"] = parent_texts[pid][:MAX_CHUNK_CHARS]
        expanded_chunks.append(c)

    # sources 정보 구성 (원본 텍스트 앞 200자)
    sources = [
        {
            "chunk_id": c["chunk_id"],
            "filename": c.get("filename", ""),
            "text": c.get("text", "")[:200],
            "score": float(c.get("rerank_score", c.get("rrf_score", 0.0))),
        }
        for c in top_chunks
    ]

    # 소스 정보를 스트리밍 시작 전 전송
    yield f"data: {json.dumps({'type': 'sources', 'sources': sources}, ensure_ascii=False)}\n\n"

    # 7. Spotlighting
    context = spotlight_chunks(expanded_chunks)

    # 8. 프로필 기반 시스템 프롬프트 구성
    profile = load_profile(request.profile)
    system_prompt = build_system_prompt(profile, context)
    temperature = get_temperature(profile)

    # 대화 히스토리 메시지 구성
    messages = [{"role": "system", "content": system_prompt}]
    for msg in request.messages:
        messages.append({"role": msg.role, "content": msg.content})

    # 9. llama-server 스트리밍
    full_answer = ""
    try:
        async for token in stream_chat(messages, temperature=temperature):
            full_answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
    except Exception as exc:
        logger.error("stream_chat_failed", error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'message': f'LLM 응답 중 오류가 발생했습니다: {exc}'}, ensure_ascii=False)}\n\n"
        return

    # 출력 검증 (경고 추가 등 — 이미 yield된 토큰과 별도로 전체 응답 검증)
    validated = validate_output(full_answer)

    # 10. SemanticCache 저장 (열거 쿼리는 건너뜀 — 매번 최신 DB 조회 보장)
    if validated and not skip_cache:
        await cache.put(question, validated)

    yield f"data: {json.dumps({'type': 'done', 'cached': False}, ensure_ascii=False)}\n\n"
    logger.info("chat_stream_done", question=question[:40], answer_len=len(full_answer))
