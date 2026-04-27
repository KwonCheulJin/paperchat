"""
채팅 RAG 파이프라인.

파이프라인:
1. PriorityScheduler.notify_chat() — 온톨로지 추출 일시정지
2. SemanticCache 조회 (cosine ≥ 0.95 → 즉시 반환)
3. Hybrid Search (BGE-M3 dense + BM25 FTS5 → RRF → top-40)
4. Cross-Encoder Rerank → top-8 (열거 쿼리: top-15)
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
import time
import uuid

from app.domain.rag.hybrid_search import hybrid_search
from app.domain.rag.reranker import rerank
from app.infrastructure.vector_store.chroma_adapter import get_parent_texts, fetch_chunks_by_ids
from app.infrastructure.graph_store.networkx_sqlite_adapter import query_path as _graph_query_path
from app.domain.rag.injection_guard import spotlight_chunks, check_injection, validate_output
from app.domain.rag.prompt_builder import load_profile, build_system_prompt, get_temperature
from app.infrastructure.llm.llama_server_adapter import stream_chat
from app.domain.rag.scheduler import get_scheduler
from app.domain.rag.cache import get_cache
from app.core.db import get_sqlite
from app.core.logging_config import get_logger, mask_query
from app.core.entity_patterns import (
    classify_query_intent,
    detect_entity_type,
    detect_doc_scope,
    query_doc_entities,
    format_entity_response,
    format_empty_entity_message,
)
from app.api.schemas.chat import ChatRequest

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
    _trace_id = str(uuid.uuid4())[:12]
    _log = logger.bind(trace_id=_trace_id)

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
        _log.warning("injection_detected", question=mask_query(question, 60))
        yield f"data: {json.dumps({'type': 'error', 'message': '허용되지 않는 입력 패턴이 감지되었습니다.'}, ensure_ascii=False)}\n\n"
        return

    # 2. PriorityScheduler 알림 — 온톨로지 추출 일시정지
    get_scheduler().notify_chat()

    # 3. SemanticCache 조회 (folder 스코프로 분리 — 다른 folder 답변 오염 방지)
    cache = get_cache()
    cached_answer = await cache.get(question, folder=request.folder)
    if cached_answer:
        _log.info("cache_hit_stream", question=mask_query(question))
        # 캐시 히트 시 토큰 단위로 분할 yield (자연스러운 스트리밍 효과)
        words = cached_answer.split(" ")
        for i, word in enumerate(words):
            token = word if i == 0 else " " + word
            yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'cached': True}, ensure_ascii=False)}\n\n"
        return

    loop = asyncio.get_event_loop()

    # 4. 쿼리 의도 분류 + 엔티티 B-경로
    top_k = 8
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
                _log.info("entity_direct_response", entity_type=entity_type, count=page.total_count)
                return
        else:
            top_k = 15

    # 5. Hybrid Search — CPU bound, executor로 실행
    # reranker 입력 수를 reranker top_k(일반 8 / 열거 15) 대비 2.5x 확보.
    # 기존 40 → 20/25 로 축소해 bge-reranker-v2-m3 CPU 추론 시간(주 TTFT 요인) 절반 절감.
    search_limit = 25 if top_k == 15 else 20
    _retrieval_start = time.monotonic()
    try:
        search_results = await loop.run_in_executor(
            None,
            functools.partial(hybrid_search, question, folder=request.folder, top_k=search_limit),
        )
    except Exception as exc:
        _log.error("hybrid_search_failed", error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'message': '검색 중 오류가 발생했습니다.'}, ensure_ascii=False)}\n\n"
        return
    _retrieval_ms = int((time.monotonic() - _retrieval_start) * 1000)

    # 5.5. 온톨로지 그래프 보강: graph_store.query_path() 결과를 후보에 추가
    # 그래프가 비어 있거나 실패해도 파이프라인은 계속 진행
    try:
        _graph_kws = [w for w in question.split() if len(w) > 1][:8]
        _graph_hits = await loop.run_in_executor(
            None,
            functools.partial(_graph_query_path, _graph_kws, max_results=5),
        )
        if _graph_hits:
            _existing_ids = {c["chunk_id"] for c in search_results}
            _new_ids = [h["chunk_id"] for h in _graph_hits if h["chunk_id"] not in _existing_ids]
            if _new_ids:
                _graph_chunks = await loop.run_in_executor(
                    None,
                    functools.partial(fetch_chunks_by_ids, _new_ids, folder=request.folder),
                )
                search_results = list(search_results) + _graph_chunks
                _log.info("graph_augmented", added=len(_graph_chunks))
    except Exception as _ge:
        _log.warning("graph_augmentation_skipped", error=str(_ge))

    # 6. Cross-Encoder Rerank → top_k (기본 8, 열거 쿼리 15) — CPU bound, executor로 실행
    _reranker_start = time.monotonic()
    try:
        top_chunks = await loop.run_in_executor(
            None, functools.partial(rerank, question, search_results, top_k=top_k)
        )
    except Exception as _re:
        # reranker 로드 실패(모델 없음 등) 시 RRF 점수 기준 상위 청크로 폴백
        _log.warning("rerank_failed_fallback", error=str(_re))
        top_chunks = list(search_results)[:top_k]
    _reranker_ms = int((time.monotonic() - _reranker_start) * 1000)

    # 7. 부모 섹션 텍스트 확장
    parent_ids = [c["parent_id"] for c in top_chunks if c.get("parent_id")]
    parent_texts: dict[str, str] = {}
    if parent_ids:
        try:
            parent_texts = await loop.run_in_executor(None, get_parent_texts, parent_ids)
        except Exception as _pe:
            _log.warning("parent_texts_failed", error=str(_pe))

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

    # Lost-in-the-middle 대응: best 청크를 컨텍스트 끝에 배치
    if len(expanded_chunks) > 2:
        best = expanded_chunks[0]
        rest = expanded_chunks[1:]
        ordered_chunks = rest + [best]
    else:
        ordered_chunks = expanded_chunks

    # 7. Spotlighting
    context = spotlight_chunks(ordered_chunks)

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
    _ttft_ms: int | None = None
    _stream_start = time.monotonic()
    try:
        async for token in stream_chat(messages, temperature=temperature):
            if _ttft_ms is None:
                _ttft_ms = int((time.monotonic() - _stream_start) * 1000)
            full_answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
    except Exception as exc:
        _log.error("stream_chat_failed", error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'message': f'LLM 응답 중 오류가 발생했습니다: {exc}'}, ensure_ascii=False)}\n\n"
        return

    # 출력 검증 (경고 추가 등 — 이미 yield된 토큰과 별도로 전체 응답 검증)
    validated = validate_output(full_answer)

    # 10. SemanticCache 저장
    # - 열거 쿼리 제외 (매번 최신 DB 조회 보장)
    # - 검색 결과가 비어있는 placeholder 답변("문서를 제공해주세요" 류)은 캐시하지 않음
    #   → 나중에 문서 업로드 후 동일 질문 시 placeholder 가 재생되는 버그 방지
    # - folder 스코프로 저장 (다른 folder 답변과 격리)
    if validated and not skip_cache and len(search_results) > 0:
        await cache.put(question, validated, folder=request.folder)

    # 메트릭 기록
    try:
        _conn = get_sqlite()
        _conn.execute(
            "INSERT INTO metrics(ts, kind, ttft_ms, retrieval_ms, reranker_ms, cache_hit)"
            " VALUES(?,?,?,?,?,?)",
            (int(time.time() * 1000), "chat", _ttft_ms, _retrieval_ms, _reranker_ms, 0),
        )
        _conn.commit()
    except Exception:
        pass  # 메트릭 실패가 응답에 영향 주지 않음

    yield f"data: {json.dumps({'type': 'done', 'cached': False}, ensure_ascii=False)}\n\n"
    _log.info(
        "chat_stream_done",
        question=mask_query(question),
        answer_len=len(full_answer),
        retrieval_ms=_retrieval_ms,
        reranker_ms=_reranker_ms,
        ttft_ms=_ttft_ms,
    )
