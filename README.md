# paperchat

로컬 LLM 기반 PDF RAG 데스크톱 챗봇. 인터넷 연결 없이 PC에서 완전히 실행됩니다.

## 주요 기능

- **PDF 업로드 & 검색** — 문서를 업로드하면 자동으로 청킹·임베딩되어 RAG 검색에 활용됩니다
- **로컬 LLM 추론** — llama-server(GGUF)를 내장, 외부 API 없이 완전 오프라인 동작
- **하드웨어 자동 감지** — 실행 시 RAM/GPU를 감지해 최적 모델을 자동 추천
- **모델 자동 다운로드** — 추천 모델을 앱 내에서 직접 다운로드
- **스트리밍 응답** — SSE 기반 실시간 토큰 스트리밍
- **세션 관리** — 채팅 세션 생성·삭제·전환

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 셸 | Tauri 2 (Rust) |
| 프론트엔드 | React 18 + TypeScript + Vite + Zustand |
| 백엔드 | FastAPI + SQLAlchemy + Uvicorn |
| 벡터 DB | ChromaDB + fastembed |
| 그래프 DB | SQLite + NetworkX (온톨로지 캐시) |
| 메타데이터 DB | SQLite (aiosqlite) |
| PDF 파싱 | PyMuPDF + pdfplumber |
| LLM 서버 | llama-server (llama.cpp) |

## 하드웨어 프로필별 모델

| 프로필 | 조건 | 모델 | 크기 |
|--------|------|------|------|
| nano | RAM 8GB 미만 | Gemma 4 E2B (Q4_K_M) | 2.0GB |
| minimal | RAM 8GB+ | Gemma 4 E4B (Q4_K_M) | 3.3GB |
| standard | RAM 16GB+ | Qwen3 8B (Q4_K_M) | 5.2GB |
| performance | RAM 32GB+ / GPU | Qwen3 14B (Q4_K_M) | 9.0GB |
| maximum | RAM 64GB+ / 고성능 GPU | Qwen3 32B (Q4_K_M) | 20.0GB |

## 아키텍처

```
┌─────────────────────────────────┐
│         Tauri 데스크톱 앱        │
│  React UI (포트 없음, 인라인)   │
└──────────┬──────────────────────┘
           │ invoke / IPC
┌──────────▼──────────────────────┐
│         Rust 코어 (lib.rs)      │
│  하드웨어 감지 / 프로세스 관리  │
└──────────┬──────────┬───────────┘
           │          │
    ┌──────▼──┐  ┌────▼──────────┐
    │ FastAPI │  │  llama-server │
    │ :8000   │  │    :11434     │
    └──────┬──┘  └───────────────┘
           │
    ┌──────▼──────────┐
    │ ChromaDB + SQLite│
    │  (로컬 파일 DB)  │
    └─────────────────┘
```

## 개발 환경 설정

### 사전 조건

- [Rust](https://rustup.rs/) (stable)
- Node.js 20+
- [pnpm](https://pnpm.io/)

### 바이너리 준비

`desktop/src-tauri/binaries/` 디렉토리는 git에서 제외됩니다. 빌드 전에 아래 파일이 필요합니다:

| 파일 | 설명 |
|------|------|
| `backend-x86_64-pc-windows-msvc.exe` | FastAPI 백엔드 (PyInstaller 번들) |
| `llama-server-x86_64-pc-windows-msvc.exe` | llama.cpp 추론 서버 |
| `ggml*.dll`, `llama.dll`, `mtmd.dll` 등 | llama.cpp GGML 백엔드 DLL |

CI/CD에서는 `binaries-latest` GitHub Release에서 자동으로 다운로드됩니다.

### 개발 모드 실행

```bash
cd desktop
pnpm install
pnpm tauri dev
```

### 프로덕션 빌드

```bash
cd desktop
pnpm tauri build
# → src-tauri/target/release/bundle/nsis/paperchat_0.1.0_x64-setup.exe
```

## 데이터 저장 경로

| 항목 | 경로 |
|------|------|
| 앱 데이터 | `%LOCALAPPDATA%\com.paperchat.desktop\` |
| 모델 파일 | `%LOCALAPPDATA%\com.paperchat.desktop\models\` |
| 로그 | `%LOCALAPPDATA%\com.paperchat.desktop\tauri.log` |
| 백엔드 DB | `%LOCALAPPDATA%\com.paperchat.desktop\paperchat.db` |

## CI/CD

`main` 브랜치 push 또는 `v*` 태그 push 시 GitHub Actions가 자동 실행됩니다.

| 트리거 | 동작 |
|--------|------|
| `main` push | Windows 빌드 + artifact 저장 |
| `v*` 태그 | 빌드 + GitHub Release 자동 생성 (NSIS 인스톨러 첨부) |

### 릴리즈 배포

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 바이너리 업데이트

llama-server 또는 backend.exe가 바뀐 경우:

```powershell
# gh CLI 필요 (https://cli.github.com)
./scripts/upload-binaries.ps1
```

## 백엔드 API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 확인 |
| `POST` | `/documents/upload` | PDF 업로드 및 인제스트 |
| `GET` | `/documents/` | 문서 목록 조회 |
| `DELETE` | `/documents/{id}` | 문서 삭제 |
| `POST` | `/chat/` | 대화 (SSE 스트리밍) |
| `POST` | `/chat/feedback` | 응답 피드백 기록 |

### 백엔드 구조

Hexagonal Architecture(포트 & 어댑터) 적용. `domain/` 레이어는 순수 비즈니스 로직만 포함하며 인프라에 직접 의존하지 않는 원칙을 따른다. 의존성 방향은 `import-linter`로 자동 검사된다.

```
app/
├── api/routes/     # HTTP 진입점
├── domain/         # 비즈니스 로직 (인프라 의존 없음)
│   ├── chat/       # RAG 파이프라인, SSE 스트리밍
│   ├── document/   # PDF 파싱, 청킹, 인덱싱
│   └── rag/        # 검색, 재순위, 프롬프트 빌더
└── infrastructure/ # 외부 시스템 어댑터
    ├── llm/        # llama-server 연동
    ├── vector_store/ # ChromaDB 연동
    ├── graph_store/  # NetworkX + SQLite 연동
    └── pdf/        # PyMuPDF 연동
```

## 라이선스

MIT
