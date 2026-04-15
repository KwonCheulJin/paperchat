# 보완 설계 — 누락·불일치·운영 안정성 개선

## 개요

- **목적**: 기존 4개 계획 문서에서 발견된 누락 항목, 계획 간 불일치, 운영 안정성 부족을 보완
- **영향 범위**: `project/backend/`, `project/frontend/`, `project/docker-compose.yml`, `installer/`
- **우선순위**: S0 (미적용 시 장애 발생) → S1 (운영 품질 저하) → S2 (개선 사항)

---

## 보완 항목 요약

| # | 항목 | 심각도 | 관련 기존 계획 |
|---|------|--------|---------------|
| 1 | API 인증 (Bearer Token) | S0 | project-runtime, frontend-ui-overhaul |
| 2 | Docker healthcheck + 서비스 기동 순서 | S0 | project-runtime |
| 3 | 인제스트 동시성 제어 (세마포어) | S0 | rag-ontology-optimization |
| 4 | 인제스트 문서 관리 API + UI | S1 | 누락 |
| 5 | 데이터 볼륨 백업/복원 | S1 | 누락 |
| 6 | Backend API 통합 (settings 엔드포인트) | S1 | frontend-ui-overhaul Phase E ↔ project-runtime 불일치 |
| 7 | Frontend 디렉토리 구조 통일 | S1 | project-runtime ↔ frontend-ui-overhaul 불일치 |
| 8 | Ollama 모델 웜업 + 로딩 인디케이터 | S1 | 누락 |
| 9 | 인제스트 실패 시 이어하기 (Resume) | S2 | 누락 |
| 10 | 구조화된 로깅 | S2 | 누락 |

---

## 1. API 인증 — Bearer Token (S0)

### 문제

nginx가 `localhost:80`을 노출하면 동일 PC의 모든 프로세스와 로컬 네트워크의 다른 기기에서 API에 무제한 접근 가능. 특히 `POST /ingest`, `POST /query`는 시스템 자원을 대량 소비하므로 보호 필수.

### 설계

설치 시 `lib.rs`가 `.env`에 `API_SECRET_KEY`를 랜덤 생성하는 구조가 이미 존재하므로, 이를 Bearer Token으로 활용한다.

#### 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/.env.example` | **수정** | `API_SECRET_KEY=` 키 추가 (값 없이) |
| `installer/src-tauri/src/lib.rs` | **수정** | `.env` 생성 시 `API_SECRET_KEY` 랜덤 생성 추가 |
| `project/backend/app/core/config.py` | **수정** | `api_secret_key: str` 필드 추가 |
| `project/backend/app/core/auth.py` | **신규** | Bearer Token 검증 미들웨어 |
| `project/backend/app/main.py` | **수정** | 미들웨어 등록 |
| `project/frontend/src/shared/api/index.ts` | **수정** | 모든 fetch 요청에 `Authorization` 헤더 추가 |
| `project/nginx/nginx.conf` | **수정** | `/health` 제외, 나머지 경로에 auth 프록시 설정 |

#### Backend 미들웨어

```python
# backend/app/core/auth.py
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings

# 인증 면제 경로
PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != settings.api_secret_key:
            raise HTTPException(401, "Invalid or missing API key")

        return await call_next(request)
```

#### Frontend 토큰 전달

```typescript
// shared/api/index.ts
// Next.js 서버 컴포넌트에서 환경변수로 주입
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? ""

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      "Authorization": `Bearer ${API_KEY}`,
    },
  })
}
```

#### .env 토큰 공유 흐름

```
lib.rs (설치 시)
  └─ .env 생성: API_SECRET_KEY=<랜덤 64자 hex>
       ├─ backend: config.py가 .env에서 읽음
       └─ frontend: docker-compose.yml에서 NEXT_PUBLIC_API_KEY=${API_SECRET_KEY} 전달
```

#### docker-compose.yml 수정

```yaml
frontend:
  environment:
    - NEXT_PUBLIC_API_KEY=${API_SECRET_KEY}
```

---

## 2. Docker healthcheck + 서비스 기동 순서 (S0)

### 문제

`depends_on`만으로는 Neo4j/Qdrant/Ollama가 완전히 준비되기 전에 backend가 연결을 시도. 실제 배포 시 "Connection refused" 에러가 첫 1~2분간 반복 발생.

### 설계

각 서비스에 `healthcheck`를 정의하고, backend의 `depends_on`에 `condition: service_healthy`를 적용한다.

#### docker-compose.yml 수정

```yaml
services:
  ollama:
    image: ollama/ollama
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:11434/api/tags"]
      interval: 10s
      timeout: 5s
      retries: 30          # 모델 로딩 시간 고려
      start_period: 30s

  qdrant:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:6333/healthz"]
      interval: 5s
      timeout: 3s
      retries: 10
      start_period: 10s

  neo4j:
    image: neo4j:5
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD}", "RETURN 1"]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 20s

  backend:
    depends_on:
      ollama:
        condition: service_healthy
      qdrant:
        condition: service_healthy
      neo4j:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8000/health"]
      interval: 10s
      timeout: 3s
      retries: 10
      start_period: 15s

  frontend:
    depends_on:
      backend:
        condition: service_healthy

  nginx:
    depends_on:
      frontend:
        condition: service_started
      backend:
        condition: service_healthy
```

### 주의

Ollama의 `retries: 30`은 모델 첫 로딩(pull 직후)에 수 분이 걸릴 수 있기 때문. `start_period`를 넉넉하게 잡아 불필요한 실패 카운트를 방지한다.

---

## 3. 인제스트 동시성 제어 — 세마포어 (S0)

### 문제

폴더 인제스트 시 PDF 50개가 동시 요청되면 Ollama 임베딩이 병렬로 50회 호출됨. Ollama는 단일 모델 기준 직렬 처리라 요청이 큐에 쌓이고, 메모리 부족 또는 타임아웃이 발생.

### 설계

Backend에 인제스트 세마포어를 두어 동시 처리 수를 제한한다.

#### 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/app/core/concurrency.py` | **신규** | 인제스트 세마포어 + 임베딩 세마포어 |
| `project/backend/app/documents/service.py` | **수정** | 인제스트 시 세마포어 acquire |
| `project/backend/app/documents/router.py` | **수정** | 배치 인제스트 엔드포인트에서 순차 처리 |

#### 구현

```python
# core/concurrency.py
import asyncio

# 동시 인제스트 PDF 수 (Ollama 부하 고려)
INGEST_SEMAPHORE = asyncio.Semaphore(2)

# 동시 임베딩 요청 수 (인제스트 1건 내에서도 청크별 임베딩)
EMBED_SEMAPHORE = asyncio.Semaphore(4)
```

```python
# documents/service.py
from app.core.concurrency import INGEST_SEMAPHORE

async def ingest_pdf(pdf_bytes: bytes, filename: str) -> dict:
    async with INGEST_SEMAPHORE:
        # 기존 인제스트 로직 전체
        ...
```

```python
# documents/router.py — 배치 인제스트
@router.post("/documents/ingest/batch")
async def ingest_batch(files: list[UploadFile]):
    """다중 PDF 순차 인제스트 + SSE 진행 상태"""
    async def stream():
        for i, file in enumerate(files):
            try:
                result = await ingest_pdf(await file.read(), file.filename)
                yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'done', **result})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'index': i, 'filename': file.filename, 'status': 'error', 'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

### 세마포어 값 기준

| 하드웨어 프로필 | INGEST_SEMAPHORE | EMBED_SEMAPHORE |
|---------------|-----------------|-----------------|
| nano/minimal | 1 | 2 |
| standard | 2 | 4 |
| performance | 3 | 6 |
| maximum | 4 | 8 |

→ `.env`의 `HARDWARE_PROFILE` 값으로 `config.py`에서 자동 결정.

---

## 4. 인제스트 문서 관리 API + UI (S1)

### 문제

현재 설계에는 "어떤 PDF가 인제스트되어 있는지 확인/삭제/재처리"하는 기능이 전혀 없음. 운영 중 문서 교체·삭제가 불가.

### 설계

#### Backend API 추가

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `GET /documents` | GET | 인제스트된 문서 목록 (id, filename, chunk수, 날짜, 상태) |
| `GET /documents/{doc_id}` | GET | 문서 상세 (청크 목록, 엔티티 수, 임베딩 상태) |
| `DELETE /documents/{doc_id}` | DELETE | 문서 삭제 (Qdrant 벡터 + Neo4j 그래프 동시 삭제) |
| `POST /documents/{doc_id}/reingest` | POST | 기존 데이터 삭제 후 재인제스트 (force 모드) |

#### 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/app/documents/router.py` | **수정** | 4개 엔드포인트 추가 |
| `project/backend/app/documents/service.py` | **수정** | `list_documents()`, `get_document()`, `delete_document()`, `reingest_document()` |
| `project/frontend/src/features/documents/` | **신규** | 문서 관리 UI 폴더 |

#### 삭제 로직

```python
async def delete_document(doc_id: str) -> dict:
    """Qdrant + Neo4j에서 문서 관련 데이터 전체 삭제"""
    # 1. Qdrant: doc_id 기준 포인트 삭제
    qdrant.delete(COLLECTION, models.FilterSelector(
        filter=models.Filter(must=[
            models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))
        ])
    ))

    # 2. Neo4j: Document → Chunk → Entity(고아만) 연쇄 삭제
    with get_neo4j_session() as session:
        session.run("""
            MATCH (d:Document {id: $doc_id})-[:HAS_CHUNK]->(c:Chunk)
            OPTIONAL MATCH (c)-[:MENTIONS]->(e:Entity)
            DETACH DELETE c
            WITH d, collect(e) AS entities
            DETACH DELETE d
            WITH entities
            UNWIND entities AS e
            WHERE NOT EXISTS { (e)<-[:MENTIONS]-() }
            DELETE e
        """, doc_id=doc_id)

    # 3. 시맨틱 캐시 무효화 (Phase 3 적용 시)
    # await semantic_cache.invalidate_by_doc(doc_id)

    return {"doc_id": doc_id, "status": "deleted"}
```

#### Frontend UI — 문서 관리 패널

```
┌──────────────────────────────────────────────────┐
│  📄 인제스트된 문서 (12개)               [새로고침] │
├──────────────────────────────────────────────────┤
│  ☑ report-2024.pdf    32청크  187엔티티  2024-03-15 │
│  ☑ contract-v2.pdf    18청크   94엔티티  2024-03-14 │
│  ☑ manual-ko.pdf      45청크  231엔티티  2024-03-13 │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  [선택 삭제]  [선택 재인제스트]                      │
└──────────────────────────────────────────────────┘
```

위치: 사이드바 하단 또는 설정 페이지 내 탭으로 배치. 기존 frontend-ui-overhaul Phase C 사이드바에 "📄 문서" 탭 추가.

---

## 5. 데이터 볼륨 백업/복원 (S1)

### 문제

`docker compose down -v` 또는 Docker Desktop 초기화 시 Qdrant 벡터, Neo4j 그래프, Ollama 모델 전체가 소실. 복구 방법이 없음.

### 설계

Launcher(Tauri)에 백업/복원 기능을 추가한다. 별도 서버 불필요, 로컬 파일 시스템에 tar.gz로 내보내기.

#### Launcher 커맨드 추가

| 커맨드 | 설명 |
|--------|------|
| `backup_data` | Qdrant snapshot + Neo4j dump → tar.gz |
| `restore_data` | tar.gz → Qdrant snapshot restore + Neo4j load |

#### 백업 대상 및 방법

| 서비스 | 백업 방법 | 복원 방법 |
|--------|---------|---------|
| Qdrant | `POST /collections/{name}/snapshots` → 스냅샷 파일 복사 | `PUT /collections/{name}/snapshots/recover` |
| Neo4j | `neo4j-admin database dump neo4j --to-path=<경로>` | `neo4j-admin database load neo4j --from-path=<경로>` |
| Ollama 모델 | 제외 (pull로 복원 가능, 용량 수 GB) | 런처 재시작 시 자동 pull |

#### Launcher UI 추가

```
┌─────────────────────────────────────────────────┐
│  데이터 관리                                     │
│  마지막 백업: 2024-03-15 14:30                   │
│  [💾 백업 생성]  [📂 백업에서 복원]               │
│  백업 위치: C:\Users\...\LocalLLM\backups\       │
└─────────────────────────────────────────────────┘
```

#### 자동 백업 (선택)

`installer/src-tauri/src/lib.rs`에서 서비스 중지(`stop_services`) 호출 시 자동 백업 옵션 제공. 기본 꺼짐, 설정에서 활성화.

---

## 6. Backend API 통합 — settings 엔드포인트 (S1)

### 문제

frontend-ui-overhaul Phase E에서 `GET /settings`, `PUT /settings` 호출을 설계했으나, project-runtime.md의 API 목록에는 해당 엔드포인트가 없음. backend 구현 시 누락될 위험.

### 설계

#### 통합 API 목록 (기존 + 추가)

| 엔드포인트 | 메서드 | 출처 |
|-----------|--------|------|
| `GET /health` | GET | project-runtime (기존) |
| `POST /documents/ingest` | POST | project-runtime (기존) |
| `POST /documents/ingest/batch` | POST | frontend-ui-overhaul Phase B (신규) |
| `GET /documents` | GET | 보완 #4 (신규) |
| `GET /documents/{doc_id}` | GET | 보완 #4 (신규) |
| `DELETE /documents/{doc_id}` | DELETE | 보완 #4 (신규) |
| `POST /documents/{doc_id}/reingest` | POST | 보완 #4 (신규) |
| `POST /chat` | POST | project-runtime (기존, `/query`에서 리네임) |
| `POST /chat/title` | POST | frontend-ui-overhaul Phase D (신규) |
| `GET /settings` | GET | frontend-ui-overhaul Phase E (신규) |
| `PUT /settings` | PUT | frontend-ui-overhaul Phase E (신규) |

#### settings 엔드포인트 상세

```python
# backend/app/api/settings.py
from pydantic import BaseModel

class Settings(BaseModel):
    system_prompt: str = ""      # 사용자 커스텀 시스템 프롬프트
    # 향후 확장: temperature, top_p 등

# 저장소: JSON 파일 (DB 불필요 — 단일 사용자)
SETTINGS_PATH = "/data/settings.json"

@router.get("/settings")
async def get_settings() -> Settings:
    if Path(SETTINGS_PATH).exists():
        return Settings.parse_file(SETTINGS_PATH)
    return Settings()

@router.put("/settings")
async def update_settings(body: Settings) -> Settings:
    Path(SETTINGS_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(SETTINGS_PATH).write_text(body.json(ensure_ascii=False))
    return body
```

#### docker-compose.yml — settings 볼륨

```yaml
backend:
  volumes:
    - backend_data:/data    # settings.json 영속화
```

---

## 7. Frontend 디렉토리 구조 통일 (S1)

### 문제

두 계획의 프론트엔드 구조가 상충:
- **project-runtime.md**: `src/app/components/ChatWindow.tsx` (Next.js 기본 구조)
- **frontend-ui-overhaul.md**: `src/features/chat/ui/chat-window.tsx` (FSD 아키텍처)

둘 다 구현하면 파일이 이중으로 존재. 어느 쪽이 정본(source of truth)인지 불명확.

### 결정

**frontend-ui-overhaul.md의 FSD 구조를 정본으로 확정한다.**

이유: shadcn/ui 도입, 세션 관리, 문서 관리 등 기능이 복잡해지면 `components/` 플랫 구조로는 한계. FSD(Feature-Sliced Design)가 적합.

#### 확정 디렉토리 구조

```
project/frontend/src/
├── app/                        # Next.js App Router (라우팅만)
│   ├── layout.tsx
│   ├── page.tsx                # → pages/chat 위임
│   ├── settings/page.tsx       # → pages/settings 위임
│   └── globals.css
├── pages/                      # 페이지 조합 레이어
│   ├── chat/ui/chat-page.tsx
│   └── settings/ui/settings-page.tsx
├── widgets/                    # 독립 UI 블록
│   └── session-sidebar/
├── features/                   # 기능 단위
│   ├── chat/                   # 채팅 기능
│   │   ├── ui/                 # message-bubble, chat-window, input-bar, ...
│   │   └── model/              # 채팅 상태
│   ├── upload-pdf/             # PDF 인제스트 기능
│   │   ├── ui/                 # file-upload, ingest-panel
│   │   └── model/              # ingest-queue
│   └── documents/              # 문서 관리 기능 (보완 #4)
│       ├── ui/                 # document-list, document-detail
│       └── model/              # document 상태
├── entities/                   # 도메인 모델
│   └── session/model/          # types.ts, store.ts
├── shared/                     # 공유 유틸리티
│   ├── api/index.ts            # apiFetch (인증 포함)
│   ├── ui/                     # markdown-renderer 등
│   ├── hooks/                  # use-keyboard-shortcuts 등
│   └── lib/utils.ts            # cn()
└── components/ui/              # shadcn/ui 자동 생성 컴포넌트
```

#### project-runtime.md 수정 사항

`project-runtime.md`의 Frontend 파일 목록을 위 FSD 구조로 갱신 필요. `src/app/components/` 경로는 더 이상 사용하지 않음.

---

## 8. Ollama 모델 웜업 + 로딩 인디케이터 (S1)

### 문제

Ollama는 모델을 메모리에 최초 로딩하는 데 10~60초 소요 (모델 크기, GPU 유무에 따라 다름). 이 시간 동안 사용자의 첫 질문이 무응답 상태로 대기.

### 설계

#### Backend 웜업 — 서버 시작 시

```python
# backend/app/main.py
@app.on_event("startup")
async def startup():
    await wait_for_ollama()
    init_neo4j_schema(get_neo4j_driver())

    # Ollama 모델 웜업: 짧은 더미 요청으로 메모리 로딩 유도
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.llm_model,
                    "messages": [{"role": "user", "content": "hi"}],
                    "stream": False,
                },
                timeout=120,  # 첫 로딩은 오래 걸림
            )
    except Exception:
        pass  # 실패해도 서비스 시작은 진행
```

#### Frontend 로딩 인디케이터

```typescript
// features/chat/ui/chat-window.tsx
// 첫 번째 메시지 전송 시 응답 지연이 10초 이상이면 표시
const [isModelLoading, setIsModelLoading] = useState(false)

// SSE 스트림 연결 후 첫 토큰까지 시간 측정
// → 10초 초과 시 "모델 로딩 중... 첫 응답이 느릴 수 있습니다" 표시
```

#### health 엔드포인트 확장

```python
# api/health.py
@router.get("/health")
async def health():
    return {
        "status": "ok",
        "ollama_ready": await check_ollama(),     # 모델 로딩 완료 여부
        "qdrant_ready": await check_qdrant(),
        "neo4j_ready": await check_neo4j(),
    }
```

Frontend에서 `/health` 폴링하여 모든 서비스가 ready일 때만 입력 바 활성화.

---

## 9. 인제스트 실패 시 이어하기 — Resume (S2)

### 문제

50개 PDF 폴더 인제스트 중 30번째에서 실패하면, 성공한 29개는 이미 저장되었지만 사용자는 전체를 재시도해야 함. 이미 인제스트된 파일은 SHA-256 중복 감지(rag-optimization Phase 0-2)로 스킵되지만, 사용자에게 "어디서 실패했는지, 몇 개가 남았는지" 정보가 부족.

### 설계

#### 배치 인제스트 응답에 resume 정보 포함

```python
# SSE 이벤트 예시
data: {"index": 29, "filename": "report-30.pdf", "status": "error", "error": "PDF 텍스트 추출 실패"}
data: {"index": 30, "filename": "report-31.pdf", "status": "skipped", "reason": "이전 오류로 인한 일시정지"}
data: {"summary": {"total": 50, "done": 29, "failed": 1, "skipped": 20, "failed_files": ["report-30.pdf"]}}
data: [DONE]
```

#### Frontend 재시도 UI

```
┌─────────────────────────────────────────────────┐
│  인제스트 결과: 29/50 완료, 1개 실패              │
│                                                  │
│  ❌ report-30.pdf — PDF 텍스트 추출 실패          │
│  ⏭ report-31.pdf ~ report-50.pdf (20개 미처리)   │
│                                                  │
│  [실패 파일만 재시도]  [나머지 전체 이어서 진행]    │
└─────────────────────────────────────────────────┘
```

동작: "나머지 전체 이어서 진행" 클릭 시 스킵된 20개 + 실패 1개를 다시 `POST /documents/ingest/batch`로 전송. 이미 인제스트된 29개는 SHA-256 중복 감지로 자동 스킵.

---

## 10. 구조화된 로깅 (S2)

### 문제

현재 설계에 로깅 전략이 전혀 없음. `print()` 또는 기본 `logging`으로는 문제 발생 시 원인 추적이 어려움.

### 설계

#### Backend — structlog 도입

```python
# backend/app/core/logging.py
import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()  # 개발 시 가독성
        # 프로덕션: structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)

log = structlog.get_logger()
```

#### 로깅 포인트

| 위치 | 로그 레벨 | 내용 |
|------|----------|------|
| `ingest_pdf` 시작/완료 | INFO | `filename`, `doc_id`, `chunk_count`, 소요 시간 |
| `ingest_pdf` 실패 | ERROR | `filename`, 에러 내용, Qdrant 롤백 여부 |
| `retrieve_context` | INFO | `question` (앞 50자), graph 결과 수, vector 결과 수 |
| `stream_answer` | INFO | `question` (앞 50자), 응답 토큰 수, 소요 시간 |
| Ollama 재시도 | WARNING | 시도 횟수, 에러 내용 |
| 인증 실패 | WARNING | 요청 IP, 요청 경로 |

#### 변경 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/requirements.txt` | **수정** | `structlog` 추가 |
| `project/backend/app/core/logging.py` | **신규** | structlog 설정 |
| `project/backend/app/documents/service.py` | **수정** | 인제스트 로깅 추가 |
| `project/backend/app/chat/service.py` | **수정** | 검색/응답 로깅 추가 |

---

## 구현 순서

기존 4개 계획과의 통합 관점에서, 보완 항목을 어느 단계에 삽입할지 정리한다.

### project-runtime 구현 시 (최초 구현과 동시 적용)

| 순서 | 항목 | 비고 |
|------|------|------|
| 1 | **#7** Frontend 디렉토리 구조 확정 | 파일 생성 전에 확정 필수 |
| 2 | **#2** Docker healthcheck | docker-compose.yml 작성과 동시 |
| 3 | **#6** settings 엔드포인트 | Backend API 작성과 동시 |
| 4 | **#10** structlog 설정 | Backend 초기 설정과 동시 |
| 5 | **#1** API 인증 미들웨어 | Backend main.py 작성과 동시 |

### rag-ontology-optimization Phase 0과 동시

| 순서 | 항목 | 비고 |
|------|------|------|
| 6 | **#3** 인제스트 세마포어 | 인제스트 서비스 수정과 동시 |
| 7 | **#8** Ollama 웜업 | main.py startup 이벤트 수정과 동시 |

### frontend-ui-overhaul Phase B와 동시

| 순서 | 항목 | 비고 |
|------|------|------|
| 8 | **#4** 문서 관리 UI | 인제스트 UI 작업과 동시 |
| 9 | **#9** 인제스트 Resume | 배치 인제스트 UI 작업과 동시 |

### Launcher 전환 이후 (독립)

| 순서 | 항목 | 비고 |
|------|------|------|
| 10 | **#5** 데이터 백업/복원 | Launcher 커맨드 추가 |

---

## 위험 요소

| 위험 | 심각도 | 완화 방법 |
|------|--------|---------|
| Bearer Token이 NEXT_PUBLIC_ 환경변수로 클라이언트에 노출 | 중 | 로컬 전용 서비스이므로 허용. 외부 공개 시 OAuth 전환 필요 |
| healthcheck 실패 시 서비스 전체 미기동 | 중 | `start_period`를 넉넉하게 설정 + Launcher에서 재시작 버튼 제공 |
| 세마포어 값이 하드웨어에 맞지 않을 경우 | 하 | .env로 오버라이드 가능하게 설계 |
| Neo4j dump 시 서비스 중단 필요 | 중 | 백업 전 자동 서비스 중지 → 백업 → 재시작 시퀀스 |
| structlog 도입 시 기존 print문과 혼재 | 하 | 초기 구현 시부터 적용하면 문제 없음 |
| settings.json 볼륨 마운트 누락 시 설정 소실 | 중 | docker-compose.yml에 볼륨 정의 필수 확인 |

---

## 검증 방법

### S0 항목
- [ ] 인증: `Authorization` 헤더 없이 `POST /chat` → 401 응답
- [ ] 인증: 올바른 Bearer Token → 200 응답
- [ ] healthcheck: `docker compose up -d` 후 `docker compose ps` → 모든 서비스 `healthy`
- [ ] healthcheck: Neo4j 컨테이너 강제 중지 → backend가 unhealthy로 전환
- [ ] 세마포어: PDF 10개 동시 인제스트 요청 → Ollama CPU/메모리 안정 유지

### S1 항목
- [ ] 문서 목록: `GET /documents` → 인제스트된 문서 목록 반환
- [ ] 문서 삭제: `DELETE /documents/{id}` → Qdrant + Neo4j에서 관련 데이터 전체 삭제 확인
- [ ] 백업: Launcher "백업 생성" → tar.gz 파일 생성 확인
- [ ] 복원: 볼륨 삭제 후 "백업에서 복원" → 데이터 복구 확인
- [ ] settings: `PUT /settings` → `GET /settings`로 값 유지 확인
- [ ] 웜업: Backend 시작 후 첫 질문 응답 시간 < 5초 (웜업 없을 때 대비)

### S2 항목
- [ ] Resume: 50개 중 30번째 실패 → "나머지 이어서 진행" → 31~50번 처리 확인
- [ ] 로깅: 인제스트 완료 후 로그에 `doc_id`, `chunk_count`, 소요 시간 포함 여부
