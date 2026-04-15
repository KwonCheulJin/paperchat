"""
온톨로지 우선순위 스케줄러.

원칙:
- 사용자 채팅이 항상 최우선
- 온톨로지 추출은 유휴 시간(30초 이상 미사용)에만 진행
- 채팅 요청 시 온톨로지 추출 즉시 일시정지
- 청크 단위 커밋으로 중단/재개 안전

사용법:
    scheduler = get_scheduler()
    scheduler.notify_chat()                    # 채팅 요청 시 호출
    scheduler.enqueue_ontology(doc_id, chunks) # 인제스트 시 큐잉
    # background_loop()는 앱 시작 시 asyncio.create_task로 실행
"""
from __future__ import annotations
import asyncio
import time
from dataclasses import dataclass, field
from typing import Callable, Awaitable
from app.core.logging_config import get_logger

logger = get_logger(__name__)

IDLE_THRESHOLD_SECS = 30   # 이 시간 이상 채팅 없으면 유휴
CHUNK_BATCH_SIZE = 5        # 한 번에 처리할 청크 수 (너무 크면 채팅 응답 지연)


@dataclass
class OntologyTask:
    doc_id: str
    chunks: list[dict]   # [{"id", "text", "doc_id"}]
    processed: int = field(default=0)   # 처리된 청크 인덱스


class PriorityScheduler:
    """채팅 우선 + 온톨로지 유휴 시 추출 스케줄러."""

    def __init__(self) -> None:
        self._last_chat_time: float = time.time()
        self._paused: bool = False
        self._queue: list[OntologyTask] = []
        self._extract_fn: Callable[[str, list[dict]], Awaitable[None]] | None = None

    def set_extract_fn(self, fn: Callable[[str, list[dict]], Awaitable[None]]) -> None:
        """온톨로지 추출 함수 주입 (Phase 3에서 설정)."""
        self._extract_fn = fn

    def notify_chat(self) -> None:
        """채팅 요청 발생 시 호출 → 유휴 타이머 리셋 + 추출 일시정지."""
        self._last_chat_time = time.time()
        if not self._paused:
            self._paused = True
            logger.debug("ontology_paused_by_chat")

    def enqueue_ontology(self, doc_id: str, chunks: list[dict]) -> None:
        """온톨로지 추출 큐에 문서 추가."""
        self._queue.append(OntologyTask(doc_id=doc_id, chunks=chunks))
        logger.info("ontology_queued", doc_id=doc_id, chunks=len(chunks))

    def get_status(self) -> dict:
        """현재 스케줄러 상태 반환 (API용)."""
        total_pending = sum(len(t.chunks) - t.processed for t in self._queue)
        return {
            "paused": self._paused,
            "queue_size": len(self._queue),
            "pending_chunks": total_pending,
            "idle_secs": round(time.time() - self._last_chat_time, 1),
        }

    async def background_loop(self) -> None:
        """앱 lifespan에서 asyncio.create_task로 시작."""
        logger.info("priority_scheduler_started")
        while True:
            await asyncio.sleep(5)  # 5초마다 체크
            idle = time.time() - self._last_chat_time

            # 유휴 상태 해제
            if idle > IDLE_THRESHOLD_SECS and self._paused:
                self._paused = False
                logger.debug("ontology_resumed", idle_secs=round(idle, 1))

            # 추출 진행
            if not self._paused and self._queue and self._extract_fn:
                task = self._queue[0]
                start = task.processed
                end = min(start + CHUNK_BATCH_SIZE, len(task.chunks))
                batch = task.chunks[start:end]

                try:
                    await self._extract_fn(task.doc_id, batch)
                    task.processed = end
                    logger.debug(
                        "ontology_batch_done",
                        doc_id=task.doc_id,
                        progress=f"{end}/{len(task.chunks)}",
                    )
                except Exception as e:
                    logger.error("ontology_batch_failed", doc_id=task.doc_id, error=str(e))
                    # 실패해도 다음 배치로 진행 (온톨로지 실패가 채팅 실패로 전파되지 않음)
                    task.processed = end

                # 작업 완료 시 큐에서 제거
                if task.processed >= len(task.chunks):
                    self._queue.pop(0)
                    logger.info("ontology_task_done", doc_id=task.doc_id)


# 싱글톤
_scheduler: PriorityScheduler | None = None


def get_scheduler() -> PriorityScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = PriorityScheduler()
    return _scheduler
