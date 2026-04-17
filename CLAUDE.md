# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 응답 언어

모든 응답은 **한글**로 작성한다.

## 개발 원칙

### YAGNI
- 현재 요청된 것만 구현한다.
- 미래를 위한 추상화·옵션·설정 추가 금지.
- 동일 패턴이 3회 이상 반복될 때만 추상화한다.

### KISS
- 가장 단순한 구현을 선택한다.
- 분기와 상태를 최소화한다.

### 명시적 작업만 수행
작업 순서: **계획 → 사용자 확인 → 실행 → 보고**

요청 없이 다음을 수행하지 않는다:
- 빌드 / 타입 체크 실행
- 커밋 / 푸시
- 리팩토링 또는 코드 개선

---

## Project Overview

PDF RAG + 온톨로지 + 로컬 LLM 서비스. 배포 단위는 단일 Tauri EXE로, 실행 시 Docker + Ollama 모델까지 자동 설치된다.

## Repository Structure

```
/
├── installer/                   # Tauri 설치 관리자 (~5MB EXE) ✅ 완성
│   ├── src-tauri/src/
│   │   ├── main.rs              # Tauri 진입점 ✅
│   │   └── lib.rs               # 하드웨어 감지 + 설치 오케스트레이션 ✅
│   ├── src-tauri/Cargo.toml     # ✅
│   ├── src-tauri/tauri.conf.json# ✅
│   ├── ui/index.html            # 설치 UI 4단계 위저드 ✅
│   └── package.json             # ✅
│
└── project/                     # EXE가 설치 경로에 복사하는 런타임 파일 (미구현)
    ├── .env.example             # 환경변수 템플릿 (키 이름 + 주석만)
    ├── docker-compose.yml       # 전체 서비스 오케스트레이션
    ├── backend/                 # FastAPI (RAG + 온톨로지 API)
    │   ├── Dockerfile
    │   ├── requirements.txt
    │   └── app/
    │       ├── main.py
    │       ├── core/config.py
    │       ├── api/ingest.py
    │       ├── api/query.py
    │       ├── api/health.py
    │       └── services/
    │           ├── rag.py
    │           ├── ontology.py
    │           └── ingestion.py
    ├── ingestion/               # 독립 CLI 배치 파이프라인
    │   ├── pipeline.py
    │   ├── pdf_parser.py
    │   ├── chunker.py
    │   ├── embedder.py
    │   └── ontology_builder.py
    ├── frontend/                # Next.js 14 App Router 채팅 UI
    │   ├── Dockerfile
    │   ├── package.json
    │   └── src/app/
    │       ├── layout.tsx
    │       ├── page.tsx
    │       ├── components/
    │       │   ├── ChatWindow.tsx
    │       │   ├── InputBar.tsx
    │       │   └── FileUpload.tsx
    │       └── lib/api.ts
    └── nginx/
        └── nginx.conf
```

## Build Commands

```bash
# 설치 관리자 EXE 빌드
cd installer
pnpm install
pnpm run build       # → src-tauri/target/release/bundle/nsis/*.exe

# 개발 모드 (Tauri 핫리로드)
cd installer
pnpm run dev

# 런타임 서비스 기동 (설치 후)
cd project
docker compose --profile standard up -d
```

## Development Prerequisites

- Rust (rustup)
- Node.js 18+
- pnpm
- Docker Desktop (개발 PC 기준)

## Architecture

### Installer (Tauri 2) — 완성
`installer/src-tauri/src/lib.rs`가 핵심. 하드웨어 감지 → 프로필 추천 → 파일 복사 → `.env` 생성 → `docker compose up -d` → Ollama 모델 pull 순서로 실행된다. UI는 `installer/ui/index.html` 단일 파일(바닐라 JS, 4단계 위저드).

### Runtime Services (Docker Compose)
`project/docker-compose.yml`이 전체 서비스를 정의한다:
- **ollama**: `ollama/ollama`, GPU 지원(nvidia runtime 조건부), port 11434
- **qdrant**: `qdrant/qdrant:latest`, port 6333
- **neo4j**: `neo4j:5`, env `NEO4J_AUTH`, heap 설정, ports 7474/7687
- **backend**: FastAPI 빌드, depends_on ollama/qdrant/neo4j, port `${BACKEND_PORT}:8000`
- **frontend**: Next.js 빌드, depends_on backend, port `${FRONTEND_PORT}:3000`
- **nginx**: `nginx:alpine`, ports 80/443, depends_on frontend/backend

**보안 원칙**: 모든 서비스는 Docker internal network만 사용. 외부 인터넷 호출 금지.

Docker Compose profiles로 하드웨어 프로필별 메모리 제한 적용:
`minimal` / `standard` / `performance` / `maximum`

### Hardware Profiles
설치 시 자동 감지한 하드웨어에 따라 Ollama 모델이 결정된다:

| 프로필      | RAM   | GPU       | 모델             |
|------------|-------|-----------|-----------------|
| nano       | <8GB  | 불필요    | gemma4:e2b      |
| minimal    | 8GB+  | 불필요    | gemma4:e4b      |
| standard   | 16GB+ | 선택      | qwen3:8b        |
| performance| 32GB+ | RTX 3060+ | qwen3:14b       |
| maximum    | 64GB+ | RTX 3090+ | qwen3:32b       |

### Backend (FastAPI)
- `app/api/ingest.py`: `POST /ingest` — PDF 업로드 → ingestion 파이프라인 호출
- `app/api/query.py`: `POST /query` — 질의응답, `text/event-stream` 스트리밍 반환
- `app/api/health.py`: `GET /health`
- `app/documents/service.py`: PyPDF 텍스트 추출 → 계층적 청킹(섹션 200단어·overlap 30) → Ollama `nomic-embed-text` 임베딩(paragraph만) → Qdrant upsert → NER → Neo4j 저장
- `app/chat/service.py`: Graph-first 검색(Neo4j 엔티티 매칭) → 부족 시 Qdrant top-5 보충 → 부모 섹션 텍스트 확장 → Ollama `/api/chat` 스트리밍
- Ollama 주소: `http://ollama:11434` (Docker 내부)

### Ingestion CLI (배치용)
`python pipeline.py --input ./docs/` 형태로 독립 실행 가능한 배치 파이프라인.

### Frontend (Next.js 14 App Router)
- 다크 테마
- 스트리밍 응답(SSE) 표시
- PDF 드래그앤드롭 업로드 + 인제스트 진행 표시

### Nginx
- `/api/` → `http://backend:8000/`
- `/` → `http://frontend:3000/`
- `client_max_body_size 100m` (파일 업로드)
- 내부 네트워크만 허용

### Environment Configuration
`.env`는 설치 시 `lib.rs`가 자동 생성한다 (랜덤 비밀키 포함). 수동으로 커밋하지 않는다.
`project/.env.example`만 커밋 — 실제 값 없이 키 이름과 설명 주석만 포함.

## Implementation Order

1. `project/docker-compose.yml` — 전체 서비스 정의
2. `project/backend/` — Dockerfile → requirements.txt → app/ 전체
3. `project/ingestion/` — CLI 배치 파이프라인
4. `project/frontend/` — Next.js 채팅 UI
5. `project/nginx/nginx.conf` — 리버스 프록시
6. `project/.env.example` — 환경변수 템플릿

---

## Design Context

### Users
직장인 — 보고서·매뉴얼·계약서·내부 규정집 등 업무 문서를 다루는 사람들.
데스크톱에서 장시간, 집중 환경에서 사용. 문서에서 원하는 정보를 빠르게 꺼내는 것이 목적.

### Brand Personality
3단어: **정밀하고 (precise) · 절제된 (restrained) · 유능한 (capable)**

감정적 목표: 사용자가 도구를 의식하지 않고 문서와 생각에 집중할 수 있는 느낌.

### Aesthetic Direction
- **테마**: 다크. 직장 환경 장시간 사용, 집중력 유지에 최적.
- **색상**: 보라 계열 액센트 유지 (OKLCH 기반으로 더 정제). 중간 채도의 보라.
- **톤**: 정밀 도구(precision tool) 미학. 라이카 카메라, 건축 도면, 활자 조판 같은 느낌.
- **금지**: 사이버펑크/네온, 기업용 SaaS 대시보드, ChatGPT·Claude 웹 UI 패턴.

### Design Principles
1. **신호만 남긴다** — 콘텐츠가 전면에 나오고 UI 크롬은 뒤로 물러난다.
2. **상태를 명확히, 장식 없이** — 스트리밍·완료·오류 상태가 한눈에 구분되되 화려한 애니메이션 없이.
3. **밀도보다 여백** — 공백이 계층을 만든다.
4. **보라는 희귀하게** — 가장 중요한 한 가지 행동에만 액센트.
5. **한국어 타이포그래피 존중** — 한글 자간·행간을 영문 기준으로 처리하지 않는다.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

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
