# Launcher 전환 + PDF 폴더 인제스트 + 채팅 세션 관리 구현 계획

## 개요

- **목적**:
  1. 설치 완료 후 EXE가 서비스 관리 Launcher로 전환 (방식 B)
  2. PDF 폴더 선택 → 일괄 인제스트 (업로드 실패 대체)
  3. Claude 앱처럼 채팅 세션 분리 관리
- **영향 범위**: `installer/` 전체, `project/frontend/` (세션 UI), `project/backend/` 없음
- **예상 복잡도**: 중간

---

## 현재 문제 진단

| 문제 | 원인 |
|------|------|
| 설치 완료 후 UX 단절 | 완료 화면이 "브라우저 접속하세요" 안내만 있음; 재실행 시 위저드 처음부터 |
| PDF 업로드 실패 | `nomic-embed-text` 임베딩 모델이 pull되지 않음 → Ollama 500 에러 |
| 채팅 세션 없음 | 새로고침 시 대화 내역 소실; 여러 주제 대화 구분 불가 |

---

## 파일 변경 목록

### Installer

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `installer/src-tauri/Cargo.toml` | 수정 | `tauri-plugin-dialog`, `reqwest` 추가 |
| `installer/src-tauri/tauri.conf.json` | 수정 | dialog 플러그인 선언 |
| `installer/src-tauri/src/lib.rs` | 수정 | 신규 커맨드 6개, 상수 추가, `pull_model` 수정 |
| `installer/ui/index.html` | 수정 | Launcher 패널 UI + 초기화 분기 로직 |

### Frontend (세션 관리)

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/frontend/src/entities/session/model/types.ts` | 신규 | Session 타입 정의 |
| `project/frontend/src/entities/session/model/store.ts` | 신규 | localStorage CRUD |
| `project/frontend/src/widgets/session-sidebar/ui/session-sidebar.tsx` | 신규 | 세션 목록 사이드바 |
| `project/frontend/src/pages/chat/ui/chat-page.tsx` | 수정 | 세션 상태 관리 + 레이아웃 변경 |

---

## Part 1: Launcher 전환

### 흐름도

```
EXE 실행
  └─ load_config() → 설치 경로 있음?
       ├─ YES → Launcher 패널 바로 표시
       └─ NO  → 4단계 설치 위저드
                  └─ 완료 → save_config() → Launcher 패널 전환
```

### Launcher 패널 UI

```
┌─────────────────────────────────────────────────┐
│  서비스 상태                        [새로고침]    │
│  ● ollama    ◉ Running                          │
│  ● backend   ◉ Running                          │
│  ● frontend  ◉ Running                          │
│  ● nginx     ◉ Running                          │
│                                                  │
│  [▶ 서비스 시작]  [■ 서비스 중지]  [↗ 앱 열기]  │
├─────────────────────────────────────────────────┤
│  PDF 문서 인제스트                               │
│  [폴더 선택]  /Users/docs                       │
│  PDF 12개 발견                                   │
│  [인제스트 시작]                                 │
│  진행: report-2024.pdf (4/12) ████████░░ 33%   │
└─────────────────────────────────────────────────┘
```

### 신규 Tauri 커맨드

| 커맨드 | 입력 | 출력 | 설명 |
|--------|------|------|------|
| `load_config` | - | `Option<AppConfig>` | `%APPDATA%\LocalLLM\config.json` 읽기 |
| `save_config` | `install_path: String` | `Result<()>` | 경로 영속화 |
| `start_services` | `project_path: String` | 이벤트 스트림 | `docker compose up -d` |
| `stop_services` | `project_path: String` | `Result<()>` | `docker compose stop` |
| `get_service_statuses` | `project_path: String` | `Vec<ServiceStatus>` | `docker compose ps --format json` 파싱 |
| `open_app_window` | - | `Result<()>` | `http://localhost` 새 WebView 창 1280×800 |
| `ingest_pdfs` | `paths: Vec<String>` | 이벤트 스트림 | PDF → `POST /api/documents/ingest` |

JS 직접 처리 (플러그인):
- 폴더 선택: `window.__TAURI__.dialog.open({ directory: true })`

### 이벤트 채널

| 이벤트명 | payload | 용도 |
|----------|---------|------|
| `launcher_event` | `{ step, message, percent }` | 서비스 시작/중지 로그 |
| `ingest_event` | `{ current, total, filename, success }` | PDF 인제스트 진행 |

### lib.rs 신규 상수 모듈

```rust
mod launcher {
    pub const CONFIG_DIR:  &str = "LocalLLM";
    pub const CONFIG_FILE: &str = "config.json";

    pub mod svc {
        pub const ALL: &[&str] = &["ollama", "backend", "frontend", "nginx"];
    }
}

mod ingest {
    pub const EMBED_MODEL:    &str = "nomic-embed-text";
    pub const BACKEND_INGEST: &str = "http://localhost/api/documents/ingest";
}

// event 모듈에 추가
mod event {
    pub const INSTALL_PROGRESS: &str = "install_progress";
    pub const PULL_PROGRESS:    &str = "pull_progress";
    pub const LAUNCHER:         &str = "launcher_event";   // 신규
    pub const INGEST:           &str = "ingest_event";     // 신규
}
```

### pull_model 수정 (nomic-embed-text 추가)

현재: 챗 모델 1개만 pull  
수정: 챗 모델(0→85%) → `nomic-embed-text`(85→100%) 순차 pull

---

## Part 2: 채팅 세션 관리

### 목표 UI (Claude 앱 레이아웃)

```
┌─────────────────────────────────────────────────────┐
│ Local LLM Chat                         [PDF 업로드] │
├───────────────┬─────────────────────────────────────┤
│  [+ 새 채팅]  │                                     │
│               │  ┌─────────────────────────────┐   │
│  Today        │  │  assistant: 안녕하세요...    │   │
│  ▶ PDF 분석.. │  └─────────────────────────────┘   │
│    계약서 검.. │           ┌──────────────────────┐  │
│               │           │ user: RAG란 무엇?    │  │
│  Yesterday    │           └──────────────────────┘  │
│    보고서 질.. │                                     │
│    법률 검토   │                                     │
│               ├─────────────────────────────────────┤
│               │  [질문 입력...                ] [전송] │
└───────────────┴─────────────────────────────────────┘
```

### 세션 데이터 구조

```typescript
// entities/session/model/types.ts
export interface Session {
  id: string          // crypto.randomUUID()
  title: string       // 첫 메시지 앞 30자 (자동 생성)
  messages: Message[]
  createdAt: number   // Date.now()
  updatedAt: number
}
```

### 저장소: localStorage

```typescript
// entities/session/model/store.ts
const KEY = 'llm_sessions'
const MAX_SESSIONS = 50

export const SessionStore = {
  getAll(): Session[]
  getById(id: string): Session | undefined
  save(session: Session): void       // create or update
  delete(id: string): void
  pruneOld(): void                   // MAX_SESSIONS 초과 시 오래된 것 삭제
}
```

### 세션 사이드바 컴포넌트

```typescript
// widgets/session-sidebar/ui/session-sidebar.tsx
interface Props {
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}
```

**그룹핑**: `updatedAt` 기준 오늘/어제/7일 이내/이전

**삭제 UX**: 세션 항목 hover 시 우측 × 버튼 표시

### chat-page.tsx 변경

```typescript
// 상태 추가
const [sessions, setSessions]     = useState<Session[]>([])
const [activeId, setActiveId]     = useState<string>('')

// 세션 전환 시
function switchSession(id: string) {
  // 현재 세션 저장 후 전환
}

// 메시지 전송 시
function sendMessage(question: string) {
  // 첫 메시지면 세션 제목 자동 설정
  if (activeSession.messages.length === 0) {
    updateTitle(question.slice(0, 30))
  }
  // 기존 streamQuery 호출
}

// 레이아웃: header 제거, 사이드바 + 채팅 2열 구조
```

### 자동 제목 생성 규칙

- 첫 user 메시지 전송 시 설정
- `question.slice(0, 30)` + (30자 초과면 `...`)
- 예: "RAG(Retrieval Augmented Gene..."

---

## 구현 단계 (순서)

### Phase A: 인프라 (Installer)
1. `Cargo.toml` — 의존성 추가
2. `tauri.conf.json` — dialog 플러그인
3. `lib.rs` — 상수 + 구조체 + 커맨드 (start, stop, status, open, ingest, config)
4. `pull_model` — nomic-embed-text 추가

### Phase B: Launcher UI
5. `ui/index.html` — Launcher 패널 HTML/CSS/JS 추가

### Phase C: 세션 관리 (Frontend)
6. `entities/session/model/types.ts` — 타입 정의
7. `entities/session/model/store.ts` — localStorage CRUD
8. `widgets/session-sidebar/ui/session-sidebar.tsx` — 사이드바 컴포넌트
9. `pages/chat/ui/chat-page.tsx` — 세션 상태 통합 + 레이아웃 변경

---

## 위험 요소

| 위험 | 완화 방법 |
|------|---------|
| `reqwest` 빌드 시간 증가 | 첫 빌드 후 캐시됨 |
| `open_app_window` 후 nginx 미응답 | start_services 완료 후에만 버튼 활성화 |
| `docker compose ps --format json` 버전 의존 | 파싱 실패 시 빈 배열 graceful fallback |
| localStorage 용량 한도 (5MB) | MAX_SESSIONS=50 + 메시지 pruning |
| `nomic-embed-text` pull 시간 (~5분) | 진행률 85→100% 구간에 별도 단계 표시 |

---

## 검증 방법

### Launcher
- [ ] 미설치 상태: 4단계 위저드 표시
- [ ] 설치 완료 후 재실행: Launcher 패널 바로 표시
- [ ] "서비스 시작" → 컨테이너 Running 확인
- [ ] "앱 열기" → 새 창 http://localhost 표시
- [ ] "서비스 중지" → 컨테이너 중지

### PDF 폴더 인제스트
- [ ] 폴더 선택 → PDF 개수 표시
- [ ] 인제스트 시작 → 파일별 진행률 표시
- [ ] 완료 후 채팅에서 해당 문서 내용 질의 응답

### 채팅 세션
- [ ] 첫 메시지 전송 → 세션 제목 자동 생성
- [ ] "새 채팅" → 빈 대화창
- [ ] 세션 클릭 → 해당 대화 복원
- [ ] 세션 삭제 → 목록에서 제거
- [ ] 새로고침 → 세션 목록 유지 (localStorage)
