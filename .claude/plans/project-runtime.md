# project/ 런타임 구현 계획

## 개요
- 목적: Tauri EXE가 사용자 PC에 복사할 `project/` 폴더 전체 구현
- 영향 범위: `project/` 신규 생성 (installer/는 완성, 건드리지 않음)
- 예상 복잡도: 높음

---

## 현재 상태

| 경로 | 상태 |
|------|------|
| `installer/src-tauri/src/main.rs` | ✅ 완성 |
| `installer/src-tauri/src/lib.rs` | ✅ 완성 |
| `installer/src-tauri/Cargo.toml` | ✅ 완성 |
| `installer/src-tauri/tauri.conf.json` | ✅ 완성 |
| `installer/ui/index.html` | ✅ 완성 |
| `installer/package.json` | ✅ 완성 |
| `project/` | ❌ 없음 (전부 신규) |

---

## 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/docker-compose.yml` | 신규 | 전체 서비스 오케스트레이션 |
| `project/.env.example` | 신규 | 환경변수 키 이름 + 주석 템플릿 |
| `project/backend/Dockerfile` | 신규 | python:3.11-slim, uvicorn |
| `project/backend/requirements.txt` | 신규 | fastapi, langchain, qdrant-client 등 |
| `project/backend/app/main.py` | 신규 | FastAPI 앱, CORS, 라우터 등록 |
| `project/backend/app/core/config.py` | 신규 | pydantic BaseSettings (.env 읽기) |
| `project/backend/app/api/ingest.py` | 신규 | POST /ingest |
| `project/backend/app/api/query.py` | 신규 | POST /query (SSE 스트리밍) |
| `project/backend/app/api/health.py` | 신규 | GET /health |
| `project/backend/app/services/ingestion.py` | 신규 | PDF → 청크 → 임베딩 → Qdrant + Neo4j |
| `project/backend/app/services/rag.py` | 신규 | 벡터 검색 + Ollama 스트리밍 |
| `project/backend/app/services/ontology.py` | 신규 | Neo4j 관계 저장/조회 |
| `project/ingestion/pipeline.py` | 신규 | CLI 진입점 (--input ./docs/) |
| `project/ingestion/pdf_parser.py` | 신규 | PyPDF + pdfminer 폴백 |
| `project/ingestion/chunker.py` | 신규 | RecursiveCharacterTextSplitter |
| `project/ingestion/embedder.py` | 신규 | Ollama nomic-embed-text 호출 |
| `project/ingestion/ontology_builder.py` | 신규 | regex NER → Neo4j 저장 |
| `project/frontend/Dockerfile` | 신규 | node:18-alpine, standalone output |
| `project/frontend/package.json` | 신규 | Next.js 14 의존성 |
| `project/frontend/src/app/layout.tsx` | 신규 | 루트 레이아웃 (다크 테마) |
| `project/frontend/src/app/page.tsx` | 신규 | 메인 채팅 페이지 |

> ⚠️ **Frontend 디렉토리 구조 변경**: 아래 `src/app/components/` 경로는 더 이상 사용하지 않음.
> `frontend-ui-overhaul.md`의 FSD 구조(features/entities/shared/widgets)가 정본.
> 상세는 `supplementary-improvements.md` #7 참고.

| ~~`project/frontend/src/app/components/ChatWindow.tsx`~~ | ~~신규~~ | → `src/features/chat/ui/chat-window.tsx` |
| ~~`project/frontend/src/app/components/InputBar.tsx`~~ | ~~신규~~ | → `src/features/chat/ui/input-bar.tsx` |
| ~~`project/frontend/src/app/components/FileUpload.tsx`~~ | ~~신규~~ | → `src/features/upload-pdf/ui/file-upload.tsx` |
| ~~`project/frontend/src/app/lib/api.ts`~~ | ~~신규~~ | → `src/shared/api/index.ts` |
| `project/nginx/nginx.conf` | 신규 | 리버스 프록시 설정 |

---

## 서비스 포트 설계

| 서비스 | 내부 포트 | 외부 노출 |
|--------|-----------|-----------|
| ollama | 11434 | 내부 전용 |
| qdrant | 6333 | 내부 전용 |
| neo4j | 7474, 7687 | 내부 전용 |
| backend | 8000 | `${BACKEND_PORT}` (nginx 경유) |
| frontend | 3000 | `${FRONTEND_PORT}` (nginx 경유) |
| nginx | 80, 443 | 외부 노출 |

---

## API 설계

### Backend

> 통합 API 목록 — `supplementary-improvements.md` #6에서 전체 정리됨

| 엔드포인트 | 메서드 | 요청 | 응답 | 출처 |
|-----------|--------|------|------|------|
| `/health` | GET | — | `{"status": "ok", "ollama_ready": bool, ...}` | 기존 + 보완#8 |
| `/documents/ingest` | POST | multipart PDF | `{"doc_id": str, "chunks": int}` | 기존 |
| `/documents/ingest/batch` | POST | multipart PDF[] | `text/event-stream` (SSE) | frontend-ui-overhaul |
| `/documents` | GET | — | `[{id, filename, chunks, entities, date}]` | 보완#4 |
| `/documents/{doc_id}` | GET | — | 문서 상세 | 보완#4 |
| `/documents/{doc_id}` | DELETE | — | `{"status": "deleted"}` | 보완#4 |
| `/documents/{doc_id}/reingest` | POST | — | `{"doc_id": str, "chunks": int}` | 보완#4 |
| `/chat` | POST | `{"question": str, "history": list}` | `text/event-stream` (SSE) | 기존 (`/query` → 리네임) |
| `/chat/title` | POST | `{"messages": list}` | `{"title": str}` | frontend-ui-overhaul |
| `/settings` | GET | — | `{"system_prompt": str}` | 보완#6 |
| `/settings` | PUT | `{"system_prompt": str}` | `{"system_prompt": str}` | 보완#6 |

### Nginx 프록시
| 경로 | 프록시 대상 |
|------|-------------|
| `/api/` | `http://backend:8000/` |
| `/` | `http://frontend:3000/` |

---

## 핵심 구현 상세

### docker-compose.yml
- profiles: `minimal` / `standard` / `performance` / `maximum` (메모리 제한 차등)
- ollama: nvidia runtime 조건부 설정
- 모든 서비스: `internal: true` 네트워크 전용

### ingestion.py (서비스)
```
PDF 파일
  → PyPDF 텍스트 추출
  → RecursiveCharacterTextSplitter(chunk_size=500, overlap=50)
  → Ollama nomic-embed-text 임베딩
  → Qdrant upsert (doc_id, chunk_index 메타데이터 포함)
  → 간단한 regex NER (날짜, 기관명, 숫자)
  → Neo4j: Document -[:HAS_CHUNK]-> Chunk -[:MENTIONS]-> Entity
```

### rag.py (서비스)
```
질문
  → Ollama nomic-embed-text 임베딩
  → Qdrant top-5 유사도 검색
  → Neo4j: 해당 청크의 엔티티 추가 조회
  → 컨텍스트 합성 (청크 + 엔티티)
  → Ollama /api/chat 스트리밍 호출
  → SSE 형태로 클라이언트에 반환
```

### frontend SSE 처리
```
POST /api/query
  → ReadableStream 수신
  → ChatWindow에서 토큰 단위 append
  → 완료 시 메시지 고정
```

---

## 구현 순서

1. **`project/docker-compose.yml`** — 기반 인프라 정의
2. **`project/backend/`** — Dockerfile → requirements.txt → core/config.py → api/ → services/
3. **`project/ingestion/`** — pdf_parser.py → chunker.py → embedder.py → ontology_builder.py → pipeline.py
4. **`project/frontend/`** — package.json → Dockerfile → lib/api.ts → components/ → page.tsx → layout.tsx
5. **`project/nginx/nginx.conf`** — 라우팅 설정
6. **`project/.env.example`** — 환경변수 템플릿

---

## 주의사항
- `.env`는 절대 생성하지 않는다 (`lib.rs`가 자동 생성)
- Ollama API: `http://ollama:11434/api/` (Docker 내부 네트워크)
- 외부 인터넷 호출 코드 작성 금지 (모든 통신은 internal network)
- frontend Dockerfile: Next.js `output: 'standalone'` 설정 필수
- installer/ 폴더는 건드리지 않는다

## 검증 방법
- [ ] `docker compose --profile standard up -d` 전체 서비스 기동
- [ ] `curl http://localhost/health` → `{"status": "ok"}`
- [ ] PDF 업로드 → `/ingest` 응답 확인
- [ ] 채팅 질문 → SSE 스트리밍 응답 수신
- [ ] `python ingestion/pipeline.py --input ./docs/` 단독 실행
