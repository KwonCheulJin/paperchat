# TODOS

항목별로 구체적인 컨텍스트를 포함합니다. 이 파일 없이 기억에 의존하지 않습니다.

---

## [TODO-1] `listDocuments()` N+1 배치 처리

**What:** `uploadFiles()` 루프에서 파일마다 호출하는 `listDocuments()`를 마지막 파일 완료 후 1번만 호출하도록 변경.

**Why:** 50개 파일 폴더 업로드 시 `listDocuments()` API가 50번 호출됨. 불필요한 네트워크 요청.

**Pros:** API 호출 대폭 감소. 인덱싱 성능 소폭 향상.

**Cons:** 파일별 문서 목록 실시간 업데이트가 사라짐 (업로드 완료 후 일괄 갱신).

**Context:**
- `backend/app/documents/service.py`의 인제스트 SSE 스트림에서 `done` 이벤트 수신 시마다
  `consumeIngestStream()`이 `listDocuments()` 호출 (documents.ts:37)
- 파일 수가 적은 환경(로컬 LLM)에서 실질적 문제가 되는 케이스는 드물지만
  폴더 업로드 기능 완성 후 자연스러운 다음 최적화 대상

**Depends on:** 폴더 업로드 진행률 PR 완료 후

---

## [TODO-3] `handleRegenerate` 메시지 append 버그 수정

**What:** 다시 생성 버튼 클릭 시 이전 assistant 메시지를 제거하지 않고 새 user+assistant 메시지를 append하여 대화가 늘어나는 버그 수정.

**Why:** `editAndResend`는 이후 메시지를 slice 후 재질문하는데, `handleRegenerate`는 append 방식이라 동작이 다름. 사용자 입장에서 "다시 생성"이 대화를 추가하는 것처럼 보임.

**Pros:** UX 일관성. `editAndResend`와 동일한 패턴으로 동작 — 마지막 assistant 메시지 제거 후 재생성.

**Cons:** `handleRegenerate`는 "모든 이전 메시지 유지 + 새 응답 추가" 방식을 의도했을 수도 있음. 변경 시 기존 사용자 경험 변경.

**Context:**
- `desktop/src/features/chat/message-list.tsx:52-57`의 `handleRegenerate` 참고
- `editAndResend`와 달리 마지막 assistant 메시지를 `filter`로 제거한 뒤 `sendMessage` 호출하면 됨
- chat-message-edit PR 완료 후 자연스러운 다음 작업

**Depends on:** chat-message-edit 기능 완료 후

---

## [TODO-2] Vitest 단위 테스트 인프라 도입

**What:** `desktop/` 프로젝트에 Vitest + @testing-library/react 설치 및 `documents.ts` store 로직 테스트 추가.

**Why:** 현재 테스트가 전무. `FolderProgress` 상태 트랜지션, 실패 카운터, 완료 타이머 등 store 로직은 단위 테스트로 검증 가능하고 리팩토링 안전망이 됨.

**Pros:** store 로직 회귀 방지. 향후 리팩토링 신뢰도 향상.

**Cons:** 인프라 세팅 비용 (약 30분). Tauri 환경 mock 필요.

**Context:**
- `desktop/package.json`에 vitest 없음 (2026-04-16 기준)
- 우선 커버할 케이스: `uploadFiles()` FolderProgress 초기화, 파일 실패 시 done 증가 확인,
  3초 타이머 클리어 동작, 단일 파일 folderName = file.name
- Tauri API는 mock 필요 (`@tauri-apps/api` vi.mock)

**Depends on:** 없음 (언제든 독립적으로 추가 가능)

---

## [TODO-4] `_detect_heading()` 한국어 헤딩 패턴 추가

**What:** `documents/service.py:235`의 `_detect_heading()`에 한국어 법률/결재 문서 헤딩 정규식 추가.

**Why:** 현재 `isupper()` 조건은 영문 대문자에만 동작. 한국어는 대소문자 없으므로 제1조, 가., 1), (1), ① 같은 업무 문서 헤딩 패턴이 전혀 감지 안 됨 → 잘못된 청킹 경계 → RAG 검색 품질 저하.

**Pros:** 한국어 법률문서·계약서·내부 규정집 청킹 품질 직접 개선. paperchat 핵심 타겟 문서 유형 커버.

**Cons:** 정규식 오탐 가능성 (짧은 한글 줄이 헤딩으로 잘못 분류될 수 있음). 추가 패턴 튜닝 필요.

**Context:**
- `backend/app/documents/service.py:221` `_detect_heading()` 함수
- 추가할 패턴 예시: `r'^(제\d+조|[가-힣]\.|[①-⑳]|\(\d+\)|\d+[.)]\s)'`
- 기존 `isupper()` 조건은 유지하고 OR로 한국어 패턴 병렬 추가
- 스마트오케스트라 Jira 이슈 PDF 테스트 케이스로 검증 권장

**Depends on:** 없음

---

## [TODO-5] SQLite → SQLCipher 실제 교체

**What:** `backend/app/core/db.py:27`의 `sqlite3.connect()` 를 `sqlcipher3` (또는 `pysqlcipher3`)로 교체. 암호화 키를 `settings.sqlite_key`에서 주입.

**Why:** CLAUDE.md에 'SQLCipher 키 관리' 보안 원칙이 명시됐고 이전 체크리스트에 완료 표시가 됐지만 실제로는 미적용 상태. 로컬 업무 PDF 내용이 평문 DB에 저장되는 보안 위험.

**Pros:** 로컬 데이터 보호. CLAUDE.md 명시 보안 원칙 이행. 사내 도구 신뢰성.

**Cons:** `requirements.txt`에 `sqlcipher3` 추가 필요. 기존 평문 DB 마이그레이션 스크립트 필요. Windows 빌드 시 OpenSSL 의존성 복잡.

**Context:**
- `backend/app/core/db.py:2` `import sqlite3` → `import sqlcipher3 as sqlite3`
- `backend/requirements.txt`에 `sqlcipher3>=0.5.0` 추가
- `settings.sqlite_key` 환경변수 추가 (Tauri 설치 시 자동 생성)
- 기존 DB 있는 경우 `ATTACH DATABASE 'new.db' AS enc KEY '...'` 마이그레이션 필요
- Windows: `sqlcipher3` pip 패키지는 OpenSSL 번들 포함 버전 확인 필요

**Depends on:** 없음 (독립적으로 진행 가능, 단 Windows 빌드 테스트 필수)

---

## [TODO-6] 백엔드 pytest 단위 테스트 인프라 도입

**What:** `backend/tests/` 디렉토리 신설, pytest + FakeRetriever/FakeGenerator 기반 도메인 로직 단위 테스트 추가.

**Why:** 백엔드 테스트 전무. Phase 1 Port 추출 이후 인프라 없이 도메인 로직만 빠르게 검증 가능한 테스트 필요. 리팩토링 안전망.

**Pros:** Port 인터페이스 설계 검증. ChromaDB/llama-server 없이 CI 실행. 회귀 방지.

**Cons:** Port 추출 전에는 Fake adapter 작성이 어려움. Phase 1 완료 후 시작해야 의미 있음.

**Context:**
- `backend/tests/unit/` — Fake adapter 기반 (인프라 불필요)
- `backend/tests/integration/` — 실제 ChromaDB/SQLite 사용
- 우선 커버할 케이스: `classify_query_intent()` 열거 키워드 감지, `_detect_heading()` 패턴, `hybrid_search()` 빈 토큰 처리
- pytest-asyncio로 async 함수 테스트

**Depends on:** ~~Phase 1 Port 추출 완료 후 시작 권장~~ **Phase 1 완료 (2026-04-21) — 지금 바로 시작 가능**

**Phase 1 완료 현황 (2026-04-21):**
- Phase 0 smoke test: `tests/smoke/` 20개 테스트 전부 통과
- Port ABC 5개: `domain/rag/ports.py` (Generator, Retriever, EmbedderPort), `domain/ontology/ports.py` (GraphStorePort), `domain/document/ports.py` (PDFParserPort)
- 어댑터 4개: `infrastructure/llm/`, `infrastructure/vector_store/`, `infrastructure/embedding/`, `infrastructure/graph_store/`
- SRP 분리: `documents/service.py` 616줄 → `parser.py` + `chunker.py` + `indexer.py` + `service.py`
- DI 컨테이너: `api/dependencies.py` (Lazy 싱글톤)

---

## [TODO-7] Phase 2 폴더 재배치 migration 스크립트

**What:** `app/services/` → `infrastructure/`, `app/chat/` → `domain/chat/` 등 import 경로 일괄 치환 스크립트 작성 및 Phase 0 smoke test 재실행 검증.

**Why:** 25개+ 파일의 import 경로를 수동으로 바꾸면 누락 발생. 스크립트 + smoke test 조합이 10초 안에 회귀 감지.

**Pros:** Phase 2 실행 속도 향상. import 실수 즉시 감지.

**Cons:** 스크립트 작성 시간 ~30분. sed 패턴이 틀리면 오히려 더 많이 깨짐 → 반드시 git branch에서 실행.

**Context:**
- Phase 2 실행 전 별도 branch 작성 후 `pytest tests/smoke/ -q`로 기준점 확인
- 치환 후 동일 smoke test 재실행 → 깨진 import 즉시 감지
- `priority_scheduler.py` → `domain/rag/scheduler.py` 이동 포함

**Depends on:** Phase 1 Port 추출 완료 + Phase 0 smoke test 작성 완료 후
