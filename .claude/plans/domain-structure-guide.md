# paperchat 도메인 구조 점검 가이드

> **목적**: paperchat의 코드베이스가 장기 유지보수와 인프라 교체 유연성을 확보할 수 있도록, 도메인 구조(폴더·파일·모듈 경계)를 점검하고 개선 방향을 잡기 위한 실무 체크리스트.
>
> **적용 원칙**: Clean Architecture 풀 버전 대신 paperchat 특성(단일 사용자, 로컬, 단일 개발자 중심, 인프라 교체 가능성 높음)에 맞춘 경량 조합 사용.
>
> **사용법**: `[ ]` 미확인 / `[x]` 적용 완료 / `[-]` 의도적 미적용(이유 기록).

---

## 왜 이 원칙들을 선택했는가

### 채택한 원칙

**1. Hexagonal Architecture (Ports & Adapters) 경량 버전**
paperchat은 llama-server가 vLLM으로, Chroma가 Qdrant로, fastembed가 다른 임베딩으로 바뀔 가능성이 매우 높습니다. 교체 가능한 인프라를 Port(인터페이스)로 분리하면 도메인 로직을 건드리지 않고 Adapter만 교체 가능.

**2. SOLID 중 DIP(의존성 역전) + SRP(단일 책임) 중심**
Hexagonal의 핵심이 DIP. "고수준 모듈(도메인)이 저수준 모듈(인프라)에 의존하지 않는다"가 곧 Port & Adapter. SRP는 파일/클래스 분할 기준으로 직관적이고 효과적.

**3. Package by Feature (도메인 중심 폴더 구조)**
Layer-first 구조(`controllers/`, `services/`, `repositories/`)는 도메인 변경 시 여러 폴더를 돌아다녀야 하는 문제가 있습니다. Feature-first(`document/`, `chat/`, `rag/`, `ontology/`)가 응집도가 높습니다.

**4. Screaming Architecture**
폴더를 열었을 때 `controllers/`, `services/`, `utils/`가 아니라 `documents/`, `chat/`, `rag/`, `ontology/`가 보이는 게 맞음.

### 의도적으로 배제한 원칙

- **`application/` (Use Case 레이어)**: 단일 사용자 앱에 과도. `service.py`가 use case 역할 충분. ← 2026-04-21 리뷰에서 삭제 확정
- **DDD 전략적 패턴**: 멀티 도메인 팀이나 복잡한 비즈니스 규칙 있을 때 유효. 오버킬.
- **CQRS**: 단일 사용자엔 불필요.
- **마이크로서비스/모듈러 모놀리스**: 단일 프로세스 배포에 불필요.

---

## 리뷰 결과 반영 (2026-04-21 /plan-eng-review — v1.2)

- `application/` 레이어 **삭제** 확정 — YAGNI, CLAUDE.md 원칙 일치
- PDFParser Port를 Phase 3 → **Phase 1으로 격상** — documents/service.py가 616줄(계속 증가 중) God module
- **documents/service.py SRP 분리(parser/chunker/indexer)를 Phase 1에 통합** — Phase 3 documents 항목 삭제
- **`rag/` 도메인 경계 명확화**: `rag/pipeline.py`(검색→리랭크→확장→프롬프트), `chat/service.py`(세션·캐시·SSE). `chat → rag` 단방향 의존. `rag/pipeline.retrieve()` = non-generator async 함수
- **`priority_scheduler.py` → `domain/rag/scheduler.py`** — 인프라 폴더 아닌 RAG 도메인 내부 조율 로직
- **Phase 0 추가: Smoke Test** — Port 추출 전 import 확인 + FastAPI `/health` 테스트 (회귀 안전망)
- **`import-linter` → pre-commit hook** — CI 파이프라인 없는 로컬 앱 환경에 맞게 조정
- **DI 컨테이너: Lazy 싱글톤 패턴 유지** — llama-server 기동 전 앱 실행 가능성 보장
- **Port ABC 5개 전부 추출** — YAGNI 긴장 있지만 인프라 교체 로드맵(Chroma→Qdrant 등) 근거로 유지

---

## Part 1. 도메인 경계 정의

### 1.1 Core Domains

- [ ] **Document**: PDF 업로드, 파싱, 청킹, 메타데이터 관리
- [ ] **Chat**: 사용자 대화 세션, 메시지 히스토리, 스트리밍
- [ ] **RAG**: Retrieval + Augmented + Generation 파이프라인
- [ ] **Ontology**: Tripartite Graph 구축, entity 추출, 관계 관리, multi-hop 탐색

### 1.2 Supporting Domains

- [ ] **Model**: LLM/Embedding 모델 다운로드, 버전 관리
- [ ] **Search**: Hybrid search (Dense + Sparse), Reranker
- [ ] **Indexing**: 임베딩 생성, 벡터 인덱스 관리, BM25 인덱스 관리

### 1.3 Infrastructure (교체 가능)

- [ ] **LLM inference**: llama-server (→ vLLM, Ollama)
- [ ] **Vector store**: ChromaDB (→ Qdrant, LanceDB)
- [ ] **Embedding**: fastembed (→ sentence-transformers)
- [ ] **PDF parser**: PyMuPDF + pdfplumber + PaddleOCR
- [ ] **Graph store**: NetworkX + SQLite (→ Neo4j embedded)
- [ ] **Metadata DB**: SQLCipher (→ DuckDB)

### 1.4 Cross-Cutting Concerns

- [ ] **Logging / Tracing**: trace_id 기반 구조화 로깅
- [ ] **Error handling**: error-snapshot 통합
- [ ] **Configuration**: 환경별/사용자별 설정 관리
- [ ] **Security**: SQLCipher 키 관리, prompt injection 방어

---

## Part 2. 권장 폴더 구조

### 2.1 Backend (Python/FastAPI)

```
backend/
├── domain/
│   ├── document/
│   │   ├── models.py        # Document, Chunk, Page 도메인 모델
│   │   ├── service.py       # 도메인 서비스 (순수 로직)
│   │   └── ports.py         # PDFParser, DocumentRepository ABC
│   ├── chat/
│   │   ├── models.py        # ChatSession, Message
│   │   ├── service.py
│   │   └── ports.py         # ChatRepository, StreamPublisher ABC
│   ├── rag/
│   │   ├── pipeline.py      # RAG 파이프라인 오케스트레이션
│   │   ├── strategies/      # HyDE, CRAG 등
│   │   └── ports.py         # Retriever, Reranker, Generator ABC
│   └── ontology/
│       ├── models.py        # Entity, Relation, GraphNode
│       ├── extractor.py
│       ├── traversal.py     # Multi-hop 탐색
│       └── ports.py         # GraphStore, EntityExtractor ABC
│
├── infrastructure/
│   ├── llm/
│   │   ├── llama_server_adapter.py
│   │   └── openai_compat_adapter.py
│   ├── embedding/
│   │   └── fastembed_adapter.py
│   ├── vector_store/
│   │   └── chroma_adapter.py
│   ├── graph_store/
│   │   └── networkx_sqlite_adapter.py
│   ├── pdf/
│   │   ├── pymupdf_adapter.py
│   │   ├── pdfplumber_adapter.py
│   │   └── paddle_ocr_adapter.py
│   └── persistence/
│       ├── sqlcipher_adapter.py
│       └── migrations/
│
├── api/
│   ├── routes/
│   │   ├── chat.py
│   │   ├── documents.py
│   │   └── health.py
│   ├── schemas/             # Pydantic I/O 스키마
│   └── dependencies.py     # DI 컨테이너 (Composition Root)
│
├── platform/
│   ├── logging.py
│   ├── config.py
│   ├── scheduler.py
│   └── errors.py
│
└── main.py                  # 조립 (wiring) + uvicorn 시작
```

### 2.2 Frontend (Tauri + React)

```
src/
├── features/
│   ├── chat/
│   │   ├── components/
│   │   ├── hooks/           # useChatStream, useChatHistory
│   │   ├── api.ts
│   │   └── types.ts
│   ├── documents/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api.ts
│   ├── ontology/
│   └── settings/
├── shared/
│   ├── ui/
│   ├── hooks/
│   └── lib/
├── app/
│   ├── routes.tsx
│   ├── store.ts
│   └── App.tsx
└── platform/
    ├── tauri.ts
    └── error-boundary.tsx
```

### 2.3 Tauri Rust

```
src-tauri/src/
├── sidecar/
│   ├── llama_server.rs
│   ├── backend.rs
│   ├── supervisor.rs
│   └── health.rs
├── commands/
│   ├── chat.rs
│   ├── documents.rs
│   └── model.rs
├── events/
│   └── stream.rs
└── main.rs
```

---

## Part 3. 원칙별 점검 체크리스트

### 3.1 Hexagonal Architecture

- [ ] **LLM 인터페이스 분리** — `Generator` ABC → `LlamaServerAdapter`
- [ ] **Vector store 인터페이스 분리** — `Retriever` ABC → `ChromaAdapter`
- [ ] **Embedding 인터페이스 분리** — `EmbedderPort` ABC → `FastembedAdapter`
- [ ] **PDF Parser 인터페이스 분리** ← Phase 1 격상 — `PDFParserPort` ABC → pymupdf/pdfplumber/paddle adapters
- [ ] **Graph store 인터페이스 분리** — `GraphStorePort` ABC → `NetworkxSqliteAdapter`

**점검 명령어** (domain/ 폴더에 인프라 라이브러리 노출 여부):
```
grep -rE "(chromadb|fastembed|llama|pymupdf|pdfplumber|networkx|sqlite3)" domain/
```
결과가 비어있어야 Hexagonal이 제대로 적용된 것.

---

### 3.2 DIP (Dependency Inversion)

- [ ] **의존성 주입 사용** — 생성자/함수 인자로 추상 타입 받기
- [ ] **조립은 `dependencies.py`에서만** — Composition Root 한 곳

```python
# Bad  — 구체 클래스 직접 생성
class ChatService:
    def __init__(self):
        self.llm = LlamaServerClient()

# Good — 추상 타입 주입
class ChatService:
    def __init__(self, llm: Generator):
        self.llm = llm
```

---

### 3.3 SRP (Single Responsibility)

- [ ] **`documents/service.py` 분리** (현재 574줄 — God module)
  - `parser.py` — PDF → raw text/tables
  - `chunker.py` — text → chunks
  - `indexer.py` — chunks → embeddings + vector store
  - `service.py` — 위 3단계 오케스트레이션
- [ ] **`chat/service.py` 책임 분리 검토**
- [ ] **React 컴포넌트**: hooks로 로직 추출

---

### 3.4 Package by Feature

- [ ] Backend 최상위 폴더가 도메인 이름
- [ ] Frontend `features/` 폴더 존재
- [ ] 동일 feature 변경 시 이동 거리 최소화

---

### 3.5 Screaming Architecture

- [ ] 루트 폴더만 봐도 "문서 기반 RAG 챗 앱"임이 보임
- [ ] 도메인 이름이 비즈니스 용어 (`ontology/`, `rag/`, `document/`)
- [ ] 프레임워크 이름이 도메인을 잠식하지 않음

---

### 3.6 의존성 방향

```
api/ → domain/ ← infrastructure/
         ↑
      (ports 통해서만)
```

- [ ] `domain/`은 다른 폴더를 import하지 않음
- [ ] `infrastructure/`는 `domain/ports`만 import
- [ ] 순환 의존 없음 (`import-linter` pre-commit hook 통합)

**`.importlinter` 설정 예시:**
```ini
[importlinter]
root_packages = app

[importlinter:contract:domain-no-infra]
name = domain/ must not import infrastructure/
type = forbidden
source_modules = domain
forbidden_modules = infrastructure

[importlinter:contract:infra-domain-only]
name = infrastructure/ may only import domain/
type = layers
layers =
    api
    domain
    infrastructure
```

**`.pre-commit-config.yaml` 예시:**
```yaml
repos:
  - repo: local
    hooks:
      - id: import-linter
        name: import-linter
        entry: lint-imports
        language: python
        pass_filenames: false
        always_run: true
```

---

### 3.7 Naming & Conventions

- [ ] Port: `XxxPort` 또는 `Xxx` (ABC) — 예: `Retriever`, `EmbedderPort`
- [ ] Adapter: `XxxAdapter` — 예: `ChromaRetrieverAdapter`, `FastembedAdapter`
- [ ] 도메인 용어 사용 (`user_query` vs `input_text` — 전자 선호)

---

### 3.8 테스트 구조

- [ ] 도메인 테스트는 인프라 없이 실행 가능 (Fake adapter)
- [ ] 테스트 폴더 구조가 소스 미러링
  ```
  tests/
  ├── unit/domain/       # 빠름, 인프라 無
  ├── integration/       # 실제 adapter
  └── e2e/               # 전체 앱 기동
  ```
- [ ] `tests/eval/` Hit@k, MRR 측정 스크립트

---

## Part 4. 안티패턴 자가 진단

| 안티패턴 | 증상 | 처방 |
|---------|------|------|
| God Module | `service.py` 500줄 초과 | SRP 분리 |
| Leaky Abstraction | 도메인 시그니처에 `ChromaQueryResult` 등 인프라 타입 | 도메인 타입으로 교체 |
| Feature Envy | `document` 서비스가 `chat` 내부 직접 참조 | 공개 인터페이스 정의 |
| Premature Abstraction | 한 곳만 쓰는데 ABC로 추상화 | YAGNI — 3회 반복 후 추상화 |
| Shotgun Surgery | 기능 1개 추가에 5개+ 파일 수정 | 응집도 개선 |

---

## Part 5. 점진적 리팩토링 전략

### Phase 0: Smoke Test (0.5일) ← 리팩토링 전 안전망

```python
# backend/tests/smoke/test_imports.py
from app.chat.service import chat_stream
from app.documents.service import ingest_pdf
from app.services.llm_client import stream_chat
from app.services.vector_store import upsert_chunks
from app.services.graph_store import query_path
# 모든 import 성공 = 기본 안전망

# backend/tests/smoke/test_startup.py
from fastapi.testclient import TestClient
from app.main import app
def test_health():
    r = TestClient(app).get('/health')
    assert r.status_code == 200
```

Phase 2 import 경로 변경 후 동일 테스트 재실행 → 깨진 모듈 10초 안에 감지.

### Phase 1: Port 추출 + SRP 분리 (4~6일) ← 가장 중요

| 순위 | 작업 | 공수 | 비고 |
|------|------|------|------|
| 1 | `Generator` Port + `LlamaServerAdapter` | 1일 | DI 패턴 기준점 |
| 2 | `Retriever` Port + `ChromaAdapter` | 1일 | Vector DB 교체 경로 |
| 3 | `EmbedderPort` + `FastembedAdapter` | 0.5일 | 임베딩 모델 교체 용이 |
| 4 | **`PDFParserPort` + SRP 분리** | 1.5일 | `documents/service.py` 616줄 → `parser.py` + `chunker.py` + `indexer.py` + `service.py`. lazy import → try/except ImportError로 어댑터 내 처리 |
| 5 | `GraphStorePort` + `NetworkxSqliteAdapter` | 0.5일 | 온톨로지 교체 경로 |
| 6 | DI 컨테이너(`dependencies.py`) | 0.5일 | **Lazy 싱글톤 패턴**: `get_xxx()` 함수로 첫 호출 시 생성. startup 시 llama-server 연결 시도 없음 |

**병렬화:** Lane A(Generator) + Lane B(Retriever+Embedder) 병렬 가능.
Lane C(PDFParser+SRP)는 Lane B와 `documents/service.py` 충돌 방지를 위해 순차 권장.

**`rag/pipeline.py` 인터페이스 패턴:**
```python
# domain/rag/pipeline.py
async def retrieve(question: str, folder: str) -> RagContext:
    """Non-generator. 검색→리랭크→확장→프롬프트 반환."""
    results = await hybrid_search(question, folder)
    ranked = rerank(question, results, top_k=top_k)
    parent_texts = get_parent_texts(...)
    system_prompt = build_system_prompt(...)
    return RagContext(chunks=ranked, system_prompt=system_prompt, ...)

# domain/chat/service.py
async def chat_stream(request) -> AsyncGenerator[str, None]:
    """SSE yield 전담. rag/pipeline 호출 후 토큰 스트리밍."""
    ctx = await rag_pipeline.retrieve(request.question, request.folder)
    yield f"data: {json.dumps({'type': 'sources', ...})}\n\n"
    async for token in llm.generate(ctx.messages):
        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
```

### Phase 2: Feature-first 재배치 (2~3일)

- `domain/`, `infrastructure/`, `api/`, `platform/` 폴더 구조 도입
- `priority_scheduler.py` → `domain/rag/scheduler.py` (채팅 시 온톨로지 추출 일시정지 — RAG 도메인 내부 조율)
- 파일 이동 + import 경로 수정 (`sed -i` 일괄 치환 + Phase 0 smoke test 재실행으로 검증)
- `import-linter` **pre-commit hook** 통합 (CI 파이프라인 대신)

### Phase 3: 테스트 구조 정비 (documents SRP 제외 — Phase 1 처리)

- `backend/tests/unit/domain/` Fake adapter 기반 pytest (TODO-6)
- `tests/eval/` golden Q&A 평가 (기존 `tests/eval/rag_eval.py` 연계)

---

## Part 6. 점검 도구

```bash
# 의존성 그래프 시각화
pip install pydeps
pydeps backend/ --max-bacon=3 --cluster

# 의존성 규칙 강제 (CI 통합)
pip install import-linter
lint-imports

# 복잡도 측정
pip install radon
radon cc backend/ -a -s
radon mi backend/ -s

# 미사용 코드
pip install vulture
vulture backend/
```

**수동 점검 질문:**
1. 이 파일 소속 도메인이 한눈에 보이는가?
2. 생성자/import에 인프라 라이브러리 이름이 있는가? (Bad sign)
3. 기능 하나 바꾸는 데 몇 개 파일 수정? (3개 이하 권장)
4. 신규 adapter 추가 시 도메인 코드 수정 필요한가? (불필요해야 정상)

---

## 부록. Generator Port 추출 예시

**Before:**
```python
# chat/service.py
import requests

class ChatService:
    def generate(self, prompt: str):
        response = requests.post("http://localhost:8080/completion", ...)
```

**After:**
```python
# domain/rag/ports.py
from abc import ABC, abstractmethod
from typing import AsyncIterator

class Generator(ABC):
    @abstractmethod
    async def generate(self, prompt: str) -> AsyncIterator[str]: ...

# infrastructure/llm/llama_server_adapter.py
import httpx
from domain.rag.ports import Generator

class LlamaServerGenerator(Generator):
    def __init__(self, base_url: str):
        self.base_url = base_url

    async def generate(self, prompt: str) -> AsyncIterator[str]:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", f"{self.base_url}/completion", ...) as r:
                async for chunk in r.aiter_text():
                    yield chunk

# domain/chat/service.py
from domain.rag.ports import Generator

class ChatService:
    def __init__(self, generator: Generator):  # DIP
        self.generator = generator

    async def reply(self, prompt: str):
        async for token in self.generator.generate(prompt):
            yield token

# main.py (Composition Root)
from infrastructure.llm.llama_server_adapter import LlamaServerGenerator
from domain.chat.service import ChatService

generator = LlamaServerGenerator(base_url="http://localhost:8080")
chat_service = ChatService(generator=generator)
```

**이득:** `ChatService` 테스트 시 `FakeGenerator` 주입 가능. 클라우드 fallback은 `OpenAIGenerator` 구현만 추가.

---

## 부록. Lazy DI 싱글톤 패턴 예시 (dependencies.py)

```python
# api/dependencies.py — Composition Root
from functools import lru_cache
from infrastructure.llm.llama_server_adapter import LlamaServerGenerator
from infrastructure.vector_store.chroma_adapter import ChromaRetrieverAdapter

@lru_cache(maxsize=1)
def get_generator() -> Generator:
    """첫 호출 시 생성. llama-server 기동 전 앱 실행 가능."""
    return LlamaServerGenerator(base_url=settings.llama_server_url)

@lru_cache(maxsize=1)
def get_retriever() -> Retriever:
    return ChromaRetrieverAdapter(collection_name=settings.chroma_collection)

# FastAPI 라우터에서
@router.post("/chat/stream")
async def chat(request: ChatRequest, gen: Generator = Depends(get_generator)):
    ...
```

---

## 부록. PDF Lazy Import → 어댑터 패턴 예시

```python
# infrastructure/pdf/pymupdf_adapter.py
class PyMuPDFAdapter(PDFParserPort):
    def parse(self, content: bytes) -> list[str]:
        try:
            import fitz  # lazy — fitz 미설치 시 pdfplumber로 폴백
        except ImportError:
            raise PDFParserUnavailable("PyMuPDF not installed")
        doc = fitz.open(stream=content, filetype="pdf")
        ...
```

---

**문서 버전**: v1.2 (2차 리뷰 반영)
**최초 작성일**: 2026-04-21
**최종 수정일**: 2026-04-21
**대상 시스템**: paperchat v5.1 MVP
**관련 문서**: `.claude/audit-2026-04-21.md`
**다음 리뷰 시점**: Phase 1 Port 추출 완료 후

---

## NOT in scope

- **CQRS, Event Sourcing** — 단일 사용자 로컬 앱에 불필요
- **마이크로서비스** — 단일 프로세스 배포 유지
- **DDD Aggregate, Value Object** — 복잡한 비즈니스 규칙 없음
- **SQLCipher 교체** (TODO-5) — 이 리팩토링과 독립, 별도 진행
- **Frontend FSD 리팩토링** — 백엔드 구조 안정화 후 별도 플랜
- **CI/CD 파이프라인 구축** — 로컬 앱, pre-commit hook으로 대체
- **Port 5개의 두 번째 어댑터 구현** — 필요 시점에 추가 (YAGNI)

---

## What already exists

| 구성 요소 | 현재 위치 | 상태 | 재사용 여부 |
|-----------|----------|------|------------|
| `llm_client.py` | `services/` | 80% 어댑터 | ABC 래핑만으로 Phase 1 완성 |
| `vector_store.py` | `services/` | 80% 어댑터 | ABC 래핑만으로 Phase 1 완성 |
| `graph_store.py` | `services/` | 80% 어댑터 | ABC 래핑만으로 Phase 1 완성 |
| `reranker.py` | `services/` | 80% 어댑터 | ABC 래핑만으로 Phase 1 완성 |
| `chat/`, `documents/` | `app/` | feature-first | Phase 2에서 `domain/` 아래로 이동만 |
| `hybrid_search.py` | `services/` | 검색 오케스트레이터 | `rag/pipeline.py`의 핵심 부품 |
| `tests/eval/rag_eval.py` | `tests/eval/` | E2E 평가 | Phase 3 테스트 구조에 통합 |

---

## Failure Modes

| 경로 | 예상 실패 | 테스트 | 에러 처리 | 사용자 경험 |
|------|----------|--------|---------|-----------|
| Phase 0 smoke 누락 | Phase 2 후 import 체인 깨짐 | GAP → smoke test 추가 | 없음 (런타임 crash) | 앱 기동 불가 — silent fail |
| PDFParser ABC 추출 시 lazy import 누락 | PyMuPDF 미설치 환경에서 import 시 crash | GAP | 없음 (현재 함수 내 import로 보호) | 인제스트 전체 불가 |
| Phase 2 import 경로 치환 실수 | 특정 모듈 미가져오기 (ModuleNotFoundError) | Phase 0 smoke test | 없음 | 해당 기능 무음 실패 |
| DI Lazy 싱글톤이 thread-safe 아닐 경우 | 동시 요청 시 어댑터 중복 생성 | GAP | 없음 | 경쟁 조건 — 로컬 앱에서 빈도 낮음 |

**Critical gaps:** 1개 — Phase 2 import 실수 시 무음 실패 (smoke test로 완화됨)

---

## 병렬화 전략

| 단계 | 건드리는 모듈 | 의존 |
|------|-------------|------|
| Phase 0: Smoke test | `tests/smoke/` (신규) | — |
| Phase 1A: Generator Port | `services/llm_client`, `domain/chat/` | — |
| Phase 1B: Retriever + Embedder Port | `services/vector_store`, `services/hybrid_search` | — |
| Phase 1C: PDFParser + SRP | `documents/service`, `domain/document/` | Phase 0 완료 후 |
| Phase 1D: GraphStore Port | `services/graph_store`, `domain/ontology/` | — |
| Phase 1E: DI container | `api/dependencies.py` (신규) | Phase 1A-D 완료 후 |
| Phase 2: 폴더 재배치 | 전체 25개+ 파일 | Phase 1 전체 완료 후 |
| Phase 3: 단위 테스트 | `tests/unit/domain/` | Phase 2 완료 후 |

**병렬 실행:** Lane A(1A) + Lane B(1B) + Lane D(1D) 동시 실행 가능.
Lane C(1C)는 Lane B와 `documents/service.py` 충돌 방지를 위해 순차.
Lane E(1E)는 모든 Port 완료 후.

**Phase 2는 단일 순차 작업.** 전체 import 경로 변경 — 병렬화 불가.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Voice | `/codex review` | Independent 2nd opinion | 1 | issues_found | 6 findings (4 incorporated, 2 rejected) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | CLEAR | 7 issues resolved, 1 critical gap (smoke test) addressed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE:** Gemini — 6 findings: YAGNI/ABC tension (rejected), chat_stream split concern (resolved with non-generator pattern), priority_scheduler placement (rejected — domain/rag/ confirmed), import-linter CI→hook (accepted), lazy DI clarification (accepted), smoke test characterization (partially accepted)
- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement Phase 0 → Phase 1
