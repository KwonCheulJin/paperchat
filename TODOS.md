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
