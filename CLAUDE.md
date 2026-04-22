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

## 버전 관리 (Push 전 필수)

**Push 시 반드시 버전을 올릴 것.** 아래 세 파일을 동시에 업데이트해야 한다:

- `desktop/package.json` — `"version"` 필드
- `desktop/src-tauri/Cargo.toml` — `version =` 필드
- `desktop/src-tauri/tauri.conf.json` — `"version"` 필드

**버전 구분 기준** (Semantic Versioning: `MAJOR.MINOR.PATCH`):

| 변경 유형 | 버전 |
|-----------|------|
| 새 기능 추가, 아키텍처 변경, UI 대규모 개편 | **minor** (0.4.x → 0.5.0) |
| 버그 수정, 소규모 개선, 설정·문서 변경 | **patch** (0.4.1 → 0.4.2) |

> `MAJOR`(1.x.x)는 사용자가 명시적으로 요청할 때만 올린다.

**버전 bump 후 반드시 git tag를 생성하고 push할 것:**

```bash
git tag -a v<NEW_VERSION> -m "v<NEW_VERSION> — <변경 요약>"
git push origin v<NEW_VERSION>
```

예: 버전이 `0.4.1 → 0.4.2`이면:
```bash
git tag -a v0.4.2 -m "v0.4.2 — UI 개선"
git push origin v0.4.2
```

> 태그는 annotated tag(`-a`)만 사용한다. lightweight tag는 GitHub 릴리즈에서 인식 불량.

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

## CSS 방법론

- **Tailwind CSS v4** 유틸리티 클래스를 기본으로 사용한다.
- **shadcn/ui** 컴포넌트를 활용한다 (`src/components/ui/`, `src/shared/ui/`).
- `cn()` 함수 (`@/lib/utils`)로 조건부 클래스를 조합한다.
- 디자인 토큰은 `src/globals.css`의 CSS 변수를 사용한다 (`var(--primary)`, `var(--text-dim)` 등).
  - Tailwind 매핑된 토큰: `bg-card`, `bg-primary`, `text-foreground`, `border-border` 등
  - 매핑되지 않은 변수: `text-[var(--text-dim)]`, `bg-[var(--surface-2)]` 등 arbitrary value 사용
- `style={{}}` 인라인 스타일은 다음 경우에만 허용:
  1. JS 런타임 계산값 (`transform: scaleX(...)`, 동적 색상 등)
  2. CSS arbitrary value로 표현하기 지나치게 복잡한 `color-mix()` (단순 케이스는 `bg-[color-mix(in_oklch,...)]` 사용)
  3. keyframe animation 트리거 외 직접 제어가 필요한 경우
- `onMouseEnter/Leave`로 직접 `style` 조작 금지 → Tailwind `hover:` 클래스 사용
- keyframe animation 참조: `[animation:ms_0.22s_ease]` 같은 arbitrary value 사용 (공백은 `_`로)

### 크기·간격·텍스트는 Tailwind 기준 scale 사용 (필수)

**`text-[Npx]`, `p-[Npx]`, `gap-[Npx]`, `w-[Npx]`, `h-[Npx]`, `rounded-[Npx]` 같은 임의 픽셀 값을 사용하지 말 것.** Tailwind 표준 스케일에 맞는 클래스를 우선 사용한다.

**필수 매핑 (이 값은 반드시 Tailwind 클래스로)**:

| px | spacing (p/m/gap/inset/top/...) | size (w/h/min/max) | 비고 |
|----|----|----|----|
| 1  | — (없음, arbitrary 유지) | `w-px`, `h-px` | 너비/높이만 `px` 유틸 존재 |
| 2  | `-0.5` | `-0.5` | |
| 4  | `-1` | `-1` | |
| 6  | `-1.5` | `-1.5` | |
| 8  | `-2` | `-2` | |
| 10 | `-2.5` | `-2.5` | |
| 12 | `-3` | `-3` | |
| 14 | `-3.5` | `-3.5` | |
| 16 | `-4` | `-4` | |
| 20 | `-5` | `-5` | |
| 24 | `-6` | `-6` | |
| 32 | `-8` | `-8` | |
| 44 | `-11` | `-11` | titlebar 등 |
| 48 | `-12` | `-12` | |

**폰트 크기** (`text-[Npx]` → 표준 클래스):
| px | 클래스 |
|----|--------|
| 12 | `text-xs` |
| 14 | `text-sm` |
| 16 | `text-base` |
| 18 | `text-lg` |
| 20 | `text-xl` |
| 24 | `text-2xl` |
| 30 | `text-3xl` |

**둥근 모서리** (`rounded-[Npx]` → 표준 클래스):
| px | 클래스 |
|----|--------|
| 2  | `rounded-xs` |
| 4  | `rounded-sm` |
| 6  | `rounded-md` |
| 8  | `rounded-lg` |
| 12 | `rounded-xl` |
| 16 | `rounded-2xl` |
| 24 | `rounded-3xl` |

**arbitrary `[Npx]` 허용 케이스 (예외)**:
1. **Tailwind scale에 없는 값** — `3, 5, 7, 9, 11, 13, 15, 17, 18, 22, 26, 38, 46` 등 (디자인 요구상 정밀 픽셀 필요)
2. **design-specific 폭/높이** — `w-[240px]`, `w-[760px]`, `max-w-[640px]`, `w-[290px]` 등 레이아웃 고유 폭
3. **CSS 변수 참조** — `text-[var(--text-dim)]`, `bg-[color-mix(...)]`
4. **keyframe 참조** — `[animation:ms_0.22s_ease]`

**새 UI 작성 시**: 먼저 표준 scale(`p-2`, `gap-3`, `rounded-lg` 등)로 맞춰보고, 디자인이 정확히 표준 값을 요구하지 않을 때만 arbitrary `[Npx]` 사용.

### 변환 패턴

| 패턴 | 변환 |
|------|------|
| `color: "var(--text-dim)"` | `text-[var(--text-dim)]` |
| `background: "var(--card)"` | `bg-card` |
| `border: "1px solid var(--border)"` | `border border-border` |
| `display: "flex", alignItems: "center"` | `flex items-center` |
| `color-mix(in oklch, ...)` | `bg-[color-mix(in_oklch,...)]` (공백→`_`) |
| 조건부 클래스 | `cn("base", condition && "conditional")` |

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
