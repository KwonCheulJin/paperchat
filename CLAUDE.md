# CLAUDE.md

## 응답 언어

모든 응답은 **한글**로 작성한다.

## 개발 원칙

- **YAGNI**: 현재 요청된 것만 구현. 동일 패턴 3회 이상 반복 시에만 추상화.
- **KISS**: 가장 단순한 구현 선택. 분기와 상태 최소화.
- **명시적 작업만**: 계획 → 사용자 확인 → 실행 → 보고. 요청 없이 빌드·커밋·리팩토링 금지.

---

## Project Overview

로컬 LLM 기반 PDF RAG 데스크톱 챗봇. 외부 인터넷 없이 완전 오프라인 동작.

- **배포 단위**: Tauri 2 단일 EXE (NSIS 인스톨러)
- **LLM**: llama-server (llama.cpp GGUF), 하드웨어 감지 후 자동 모델 선택
- **RAG**: ChromaDB(벡터) + SQLite(메타데이터) + NetworkX(그래프)

## Repository Structure

```
/
├── desktop/              # Tauri 2 (Rust) + React/Vite 프론트엔드
│   ├── src/              # React UI (TypeScript + Zustand)
│   └── src-tauri/        # Rust 코어 (하드웨어 감지, 프로세스 관리, IPC)
│       └── binaries/     # backend.exe + llama-server.exe (git 제외)
│
└── backend/              # FastAPI (RAG + 문서 관리)
    ├── app/
    │   ├── api/          # routes/ + schemas/ (HTTP 레이어)
    │   ├── domain/       # 순수 비즈니스 로직 (인프라 의존 없음 원칙)
    │   │   ├── chat/     # chat service (SSE 스트리밍, RAG 파이프라인)
    │   │   ├── document/ # parser, chunker, indexer, service
    │   │   └── rag/      # hybrid_search, reranker, injection_guard,
    │   │                 #   prompt_builder, cache, scheduler
    │   ├── infrastructure/  # 어댑터 구현체
    │   │   ├── llm/         # llama_server_adapter.py
    │   │   ├── vector_store/# chroma_adapter.py
    │   │   ├── graph_store/ # networkx_sqlite_adapter.py
    │   │   ├── pdf/         # pymupdf_adapter.py
    │   │   └── embedding/   # fastembed_adapter.py
    │   └── core/         # config, db, logging
    ├── tests/
    │   ├── smoke/        # import + startup 검증 (20개)
    │   └── unit/domain/  # 순수 함수 단위 테스트 (40개)
    └── setup.cfg         # import-linter 의존성 방향 계약 3개
```

## Build & Test Commands

```bash
# 데스크톱 개발 모드
cd desktop && pnpm tauri dev

# 백엔드 단독 실행
cd backend && python -m uvicorn app.main:app --reload --port 8000

# 테스트
cd backend && PYTHONPATH=. pytest tests/ -q

# 의존성 방향 검사 (import-linter)
cd backend && PYTHONPATH=. .venv/Scripts/lint-imports
```

## Pre-push 빌드 검증

`desktop/src-tauri/` 또는 `desktop/package.json` 파일이 변경된 커밋을 push하면
Husky pre-push 훅이 자동으로 `pnpm tauri build`를 실행해 CI 실패를 사전에 방지한다.

**최초 설정 (클론 후 1회)**:
```bash
npm install   # 루트에서 실행 — Husky 훅 등록
```

**검증 수동 실행**:
```bash
bash scripts/validate-tauri-build.sh
```

**빌드 건너뛰기** (긴급 push 시):
```bash
SKIP_TAURI_BUILD=1 git push
# 또는
git push --no-verify
```

**tauri.conf.json 주의사항**:
- `bundle.resources` 는 `string[]` 또는 `Record<string, string>` 만 허용
- `[{"src":"...","dest":"..."}]` 배열-of-objects 형식은 Tauri 2 스키마 오류
- 올바른 예: `{"binaries/llama-server.exe": "."}`

## Backend Architecture

**Hexagonal Architecture (Ports & Adapters)**

- `domain/*/ports.py` — Port ABC 정의
- `infrastructure/*/` — 어댑터 구현체 (포트 구현)
- `api/routes/` → `domain/` → `infrastructure/` 방향만 허용

**알려진 tech debt**: `setup.cfg`의 `ignore_imports`에 domain → infra 직접 참조 6개 등록.
추후 포트 주입(DI) 방식으로 제거 예정.

## Design Context

**사용자**: 직장인 — 보고서·계약서·내부 규정집 등 업무 문서를 집중 환경에서 사용.

**디자인 원칙**: 정밀하고(precise) · 절제된(restrained) · 유능한(capable)
- 다크 테마, 보라 계열 액센트 (OKLCH, 희귀하게 사용)
- 콘텐츠 전면, UI 크롬 후면
- 사이버펑크/네온, SaaS 대시보드 패턴 금지

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
