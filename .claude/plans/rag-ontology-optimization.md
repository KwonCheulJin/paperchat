# RAG + 온톨로지 최적화 작업 계획

## 개요

- **목적**: 연구 기반 7가지 최적화 전략을 현재 RAG 파이프라인에 적용하여 검색 정확도와 응답 품질을 대폭 향상
- **영향 범위**: `project/backend/`, `project/ingestion/`
- **예상 복잡도**: 높음
- **우선순위**: 투자 대비 효과 순 (Phase 1 → 2 → 3)

---

## 현재 구현 진단

| 항목 | 현재 상태 | 문제점 |
|------|----------|--------|
| 청킹 | 500단어 고정 슬라이딩 윈도우 | 문서 구조(섹션/문단) 무시, 맥락 단절 |
| 검색 | Qdrant Top-5 벡터 검색 → Neo4j 엔티티 추가 조회 | 벡터 우선 전략으로 구조적 질문에 취약 |
| 온톨로지 | regex NER → `(:Chunk)-[:MENTIONS]->(:Entity)` | 엔티티만 저장, 엔티티 간 관계 없음 |
| Neo4j 활용 | 검색된 청크의 엔티티명만 보조 컨텍스트로 추가 | 그래프 탐색(traverse) 미활용 |
| 프롬프트 | 단순 시스템 프롬프트 + 청크 나열 | 출처 추적·환각 방지 장치 없음 |
| 평가 체계 | 없음 | 최적화 효과 측정 불가 |

---

## 파일 변경 목록

### Phase 0 — 사전 조건 (Phase 1 진행 전 필수)

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/app/core/db.py` | **수정** | Neo4j 드라이버 초기화 시 인덱스/제약조건 자동 생성 |
| `project/backend/app/documents/service.py` | **수정** | 인제스트 트랜잭션 처리 + Qdrant 롤백 + 중복 감지 |
| `project/backend/app/documents/service.py` | **수정** | Ollama 재시도 로직 (`tenacity` 활용) + 파일 크기/MIME 검증 |
| `project/ingestion/ontology_builder.py` | **수정** | 한글 NER 패턴 추가 + Neo4j 배치 쿼리 (N+1 제거) |
| `project/ingestion/embedder.py` | **수정** | Ollama 재시도 로직 적용 |

### Phase 1 — 핵심 3가지 (투자 대비 효과 최대)

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/ingestion/chunker.py` | **수정** | 계층적 청킹 (부모-자식 구조) |
| `project/ingestion/ontology_builder.py` | **수정** | 엔티티 간 관계 추출 + Chunk 노드 텍스트 전체 저장 |
| `project/backend/app/documents/service.py` | **수정** | 인제스트 시 계층적 청킹 + 확장된 Neo4j 스키마 적용 |
| `project/backend/app/chat/service.py` | **수정** | Graph-first 검색 전략으로 전환 |

### Phase 2 — 품질 강화

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/app/chat/service.py` | **수정** | 프롬프트 엔지니어링 (출처 표기 + CoT) |
| `project/backend/app/chat/prompt.py` | **신규** | 프롬프트 템플릿 분리 관리 |
| `project/backend/app/core/glossary.py` | **신규** | 사내 용어 사전 (동의어 매핑) |
| `project/ingestion/embedder.py` | **수정** | 쿼리 확장 (동의어 치환 후 임베딩) |

### Phase 3 — 운영 최적화

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `project/backend/app/core/cache.py` | **신규** | 시맨틱 캐시 (유사 질문 캐싱) |
| `project/backend/app/chat/service.py` | **수정** | 캐시 레이어 통합 |
| `project/tests/golden_set.json` | **신규** | Golden set 평가 데이터 |
| `project/tests/eval_rag.py` | **신규** | RAG 품질 평가 스크립트 |

---

## Phase 0: 사전 조건 (Phase 1 진행 전 필수 수정)

Phase 1의 Graph-first 검색과 온톨로지 확장은 아래 항목들이 해결되지 않으면 실제로 동작하지 않거나 성능이 나오지 않는다.

---

### 0-1. Neo4j 인덱스 / 제약조건 추가

**근거**: `Chunk.id`, `Document.id`, `Entity.name`에 인덱스가 전혀 없음. 데이터가 수천 건만 넘어도 Graph-first 검색이 초 단위로 느려짐. Phase 1의 `_search_graph()` 자체가 인덱스 없이는 풀 스캔.

**변경 사항 — `core/db.py`**:

```python
def init_neo4j_schema(driver):
    """앱 시작 시 1회 실행 — 인덱스/제약조건 멱등 생성"""
    with driver.session() as session:
        session.run("""
            CREATE CONSTRAINT document_id IF NOT EXISTS
            FOR (d:Document) REQUIRE d.id IS UNIQUE
        """)
        session.run("""
            CREATE CONSTRAINT chunk_id IF NOT EXISTS
            FOR (c:Chunk) REQUIRE c.id IS UNIQUE
        """)
        session.run("""
            CREATE CONSTRAINT entity_name IF NOT EXISTS
            FOR (e:Entity) REQUIRE e.name IS UNIQUE
        """)
        # 검색 성능용 복합 인덱스
        session.run("""
            CREATE INDEX chunk_doc_idx IF NOT EXISTS
            FOR (c:Chunk) ON (c.id, c.index)
        """)
        session.run("""
            CREATE FULLTEXT INDEX entity_search IF NOT EXISTS
            FOR (e:Entity) ON EACH [e.name]
        """)
```

**`main.py` 앱 시작 시 호출**:
```python
@app.on_event("startup")
async def startup():
    await wait_for_ollama()
    init_neo4j_schema(get_neo4j_driver())  # 추가
```

---

### 0-2. 인제스트 트랜잭션 처리 + 중복 감지

**근거**: 현재 Qdrant 저장 성공 → Neo4j 저장 실패 시 Qdrant에 고아 데이터가 남음. 동일 파일 재업로드 시 중복 청크 누적.

**변경 사항 — `documents/service.py`**:

```python
async def ingest_pdf(pdf_bytes: bytes, filename: str) -> dict:
    # 중복 감지: 파일 해시 기반
    file_hash = hashlib.sha256(pdf_bytes).hexdigest()
    with get_neo4j_session() as session:
        existing = session.run(
            "MATCH (d:Document {hash: $hash}) RETURN d.id AS id LIMIT 1",
            hash=file_hash
        ).single()
        if existing:
            return {"doc_id": existing["id"], "chunks": 0, "status": "duplicate"}

    doc_id = str(uuid.uuid4())
    text = extract_text(pdf_bytes)

    # 파일 크기·텍스트 유효성 검증
    if len(pdf_bytes) > 50 * 1024 * 1024:  # 50MB 상한
        raise HTTPException(400, "파일 크기가 50MB를 초과합니다.")
    if not text.strip():
        raise HTTPException(422, "텍스트를 추출할 수 없는 PDF입니다.")

    chunks = split_chunks(text)
    qdrant_stored = False

    try:
        # Qdrant 저장
        await store_vectors(doc_id, filename, chunks)
        qdrant_stored = True

        # Neo4j 저장 (실패 시 Qdrant 롤백)
        store_graph(doc_id, filename, chunks, file_hash=file_hash)

    except Exception as e:
        if qdrant_stored:
            # Qdrant 롤백: doc_id 기준 포인트 삭제
            qdrant.delete(COLLECTION, models.FilterSelector(
                filter=models.Filter(must=[
                    models.FieldCondition(
                        key="doc_id",
                        match=models.MatchValue(value=doc_id)
                    )
                ])
            ))
        raise HTTPException(500, f"인제스트 실패: {e}") from e

    return {"doc_id": doc_id, "chunks": len(chunks), "status": "ok"}
```

**Neo4j 내부 트랜잭션 처리 (`store_graph`)**:
```python
def store_graph(doc_id, filename, chunks, file_hash):
    with get_neo4j_session() as session:
        with session.begin_transaction() as tx:  # 명시적 트랜잭션
            tx.run(
                "MERGE (d:Document {id: $id}) SET d.filename=$fn, d.hash=$hash",
                id=doc_id, fn=filename, hash=file_hash
            )
            for i, chunk in enumerate(chunks):
                chunk_id = f"{doc_id}_{i}"
                tx.run(...)  # Chunk + Entity
            tx.commit()
```

---

### 0-3. Ollama 재시도 로직

**근거**: `requirements.txt`에 `tenacity`가 설치되어 있지만 미사용. Ollama 컨테이너 재시작·일시 과부하 시 서비스 전체가 중단됨.

**변경 사항 — `documents/service.py` 및 `ingestion/embedder.py`**:

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
)
async def embed(text: str) -> list[float]:
    async with _get_embed_semaphore():
        resp = await client.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={"model": "nomic-embed-text", "prompt": text},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
```

**LLM 스트리밍도 동일하게 적용** (`chat/service.py`의 `stream_answer()`):
- 연결 실패 시 SSE 스트림을 통해 구조화된 에러 이벤트 반환
- `data: {"error": "LLM 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요."}`

---

### 0-4. 한글 NER 패턴 추가 + 배치 쿼리 (N+1 제거)

**근거**: 현재 regex는 `[A-Z]` 기반이라 한글 문서에서 엔티티가 거의 추출되지 않음. Graph-first 검색은 엔티티 품질이 전제 조건. 또한 엔티티당 별도 쿼리를 실행해 20개 엔티티 × 1000개 청크 = 최대 20,000번 쿼리 발생.

**변경 사항 — `ingestion/ontology_builder.py`**:

```python
def extract_entities(text: str) -> list[tuple[str, str]]:
    """엔티티 추출 → (이름, 타입) 리스트 반환"""
    patterns = [
        # 한글 고유명사 (2~5자 명사구)
        (r"[가-힣]{2,5}(?:부|처|청|원|원|팀|실|본부|센터|회사|그룹)", "ORG"),
        (r"[가-힣]{2,4}(?:님|씨|장|장|대표|팀장|부장|과장)", "PERSON"),
        # 날짜/숫자
        (r"\d{4}[-./년]\s?\d{1,2}[-./월]\s?\d{1,2}일?", "DATE"),
        (r"\d{4}년\s?\d{1,2}월", "DATE"),
        # 영문 고유명사 (기존)
        (r"\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b", "PERSON"),
        (r"\b[A-Z]{2,}\b", "ABBR"),
        # 금액/수치
        (r"\d+(?:,\d{3})*(?:\.\d+)?(?:억|만|천|백|원|달러|%)", "NUMBER"),
    ]
    entities = set()
    for pattern, etype in patterns:
        for match in re.findall(pattern, text):
            entities.add((match.strip(), etype))
    return list(entities)[:30]  # 청크당 최대 30개
```

**Neo4j 배치 쿼리 (N+1 → UNWIND)**:

```python
def save_entities_batch(session, chunk_id: str, entities: list[tuple[str, str]]):
    """엔티티 리스트를 한 번의 쿼리로 일괄 저장"""
    session.run("""
        UNWIND $entities AS ent
        MERGE (e:Entity {name: ent.name})
        ON CREATE SET e.type = ent.type
        WITH e
        MATCH (c:Chunk {id: $chunk_id})
        MERGE (c)-[:MENTIONS]->(e)
    """, chunk_id=chunk_id, entities=[{"name": n, "type": t} for n, t in entities])
```

---

## Phase 1: 핵심 최적화 (투자 대비 효과 최대)

### 1-1. 그래프에 텍스트 청크 노드 직접 통합

**근거**: 온톨로지 기반 지식 그래프에 청크 정보를 통합하면 벡터 전용 RAG를 크게 능가하는 성능 (정확도 90% 달성). 청크 없는 그래프는 성능이 상당히 낮음.

**현재 문제**: `Chunk.text`에 처음 200자만 저장 → 전체 텍스트 정보 손실

**변경 사항**:

#### Neo4j 스키마 확장

```
현재:
  (:Document)-[:HAS_CHUNK]->(:Chunk {text: 200자})-[:MENTIONS]->(:Entity {name})

변경 후:
  (:Document {id, filename, ingested_at})
    -[:HAS_CHUNK]->(:Chunk {id, text: 전체, index, token_count})
      -[:MENTIONS]->(:Entity {name, type})
      -[:NEXT]->(:Chunk)                          ← 순서 관계 추가
  (:Entity)-[:RELATED_TO {source_chunk}]->(:Entity)  ← 엔티티 간 관계 추가
```

#### ontology_builder.py 수정

```python
# 변경 전
session.run("""
    MERGE (c:Chunk {id: $chunk_id})
    SET c.text = $text, c.index = $index
""", chunk_id=chunk_id, text=chunk[:200], index=i)

# 변경 후
session.run("""
    MERGE (c:Chunk {id: $chunk_id})
    SET c.text = $text, c.index = $index, c.token_count = $token_count
""", chunk_id=chunk_id, text=chunk, index=i, token_count=len(chunk.split()))

# NEXT 관계 추가 (청크 간 순서 연결)
if i > 0:
    prev_chunk_id = f"{doc_id}_{i - 1}"
    session.run("""
        MATCH (prev:Chunk {id: $prev_id}), (curr:Chunk {id: $curr_id})
        MERGE (prev)-[:NEXT]->(curr)
    """, prev_id=prev_chunk_id, curr_id=chunk_id)
```

#### 엔티티 간 관계 추출 추가

```python
def extract_entity_relations(text: str, entities: list[str]) -> list[tuple[str, str]]:
    """같은 문장에 등장하는 엔티티 쌍을 RELATED_TO로 연결"""
    relations = []
    sentences = text.split(".")
    for sentence in sentences:
        found = [e for e in entities if e in sentence]
        for i in range(len(found)):
            for j in range(i + 1, len(found)):
                relations.append((found[i], found[j]))
    return relations
```

---

### 1-2. Graph-first 검색 전략 전환

**근거**: KPI·전략 분석 같은 구조적 질문에서 벡터 전용 RAG는 정확도 0%였으나, GraphRAG는 안정적 성능 유지. 그래프 먼저 탐색하고 부족한 부분만 벡터로 보충하는 방식이 효과적.

**현재 문제**: `_search_qdrant()` → `_get_entities()` 순서로 벡터 우선 전략 사용

**변경 사항 — chat/service.py**:

```python
async def retrieve_context(question: str) -> dict:
    # --- 현재 ---
    # chunks = await _search_qdrant(question)
    # entities = _get_entities(chunk_ids)

    # --- 변경 후: Graph-first 전략 ---

    # Step 1: 질문에서 키워드/엔티티 추출
    keywords = extract_query_entities(question)

    # Step 2: Graph 검색 — 키워드와 일치하는 엔티티 → 연결된 청크 탐색
    graph_chunks = await _search_graph(keywords)

    # Step 3: Graph 결과가 충분하면(≥3개) 그대로 사용
    #          부족하면 벡터 검색으로 보충
    if len(graph_chunks) < 3:
        vector_chunks = await _search_qdrant(question)
        # 중복 제거 후 병합 (Graph 결과 우선)
        all_chunks = _merge_chunks(graph_chunks, vector_chunks, max_total=5)
    else:
        all_chunks = graph_chunks[:5]

    # Step 4: 관련 엔티티 + 엔티티 간 관계도 함께 수집
    chunk_ids = [c["chunk_id"] for c in all_chunks]
    entities = _get_entities(chunk_ids)
    relations = _get_entity_relations(chunk_ids)

    return {"chunks": all_chunks, "entities": entities, "relations": relations}
```

#### 신규 함수: `_search_graph()`

```python
def _search_graph(keywords: list[str]) -> list[dict]:
    """Neo4j에서 키워드 매칭 엔티티 → 연결된 Chunk 텍스트 반환"""
    with get_neo4j_session() as session:
        result = session.run("""
            UNWIND $keywords AS kw
            MATCH (e:Entity)
            WHERE toLower(e.name) CONTAINS toLower(kw)
            MATCH (c:Chunk)-[:MENTIONS]->(e)
            OPTIONAL MATCH (c)<-[:HAS_CHUNK]-(d:Document)
            RETURN DISTINCT c.id AS chunk_id, c.text AS text,
                   d.filename AS filename, c.index AS chunk_index,
                   collect(DISTINCT e.name) AS matched_entities
            ORDER BY size(matched_entities) DESC
            LIMIT 5
        """, keywords=keywords)
        return [dict(r) for r in result]
```

---

### 1-3. 계층적 청킹 (Parent-Child Chunking)

**근거**: 작은 청크(문단)로 정밀 검색하되, LLM에는 부모 청크(섹션 전체)를 전달하여 맥락 유지. 검색 정밀도와 응답 품질을 동시에 확보.

**현재 문제**: 500단어 고정 분할로 문서 구조 무시, LLM에 전달되는 컨텍스트도 좁은 청크 그대로

**변경 사항 — chunker.py**:

```python
@dataclass
class ChunkNode:
    id: str
    text: str
    level: str           # "section" | "paragraph"
    parent_id: str | None
    children_ids: list[str]

def hierarchical_chunk(text: str, doc_id: str) -> list[ChunkNode]:
    """
    1차: 빈 줄 2개 이상 or 제목 패턴으로 섹션(부모) 분할
    2차: 각 섹션 내에서 문단(자식) 분할 (200단어 기준)
    검색: 자식(문단) 단위로 임베딩·검색
    LLM 전달: 매칭된 자식의 부모(섹션) 텍스트 전달
    """
    sections = split_by_sections(text)  # 부모 청크
    nodes = []

    for si, section_text in enumerate(sections):
        parent_id = f"{doc_id}_s{si}"
        paragraphs = split_paragraphs(section_text, chunk_size=200, overlap=30)
        child_ids = [f"{parent_id}_p{pi}" for pi in range(len(paragraphs))]

        # 부모 노드 (섹션 전체 텍스트)
        nodes.append(ChunkNode(
            id=parent_id,
            text=section_text,
            level="section",
            parent_id=None,
            children_ids=child_ids,
        ))

        # 자식 노드 (문단)
        for pi, para in enumerate(paragraphs):
            nodes.append(ChunkNode(
                id=child_ids[pi],
                text=para,
                level="paragraph",
                parent_id=parent_id,
                children_ids=[],
            ))

    return nodes
```

**Qdrant 저장 변경**: 자식(paragraph) 청크만 임베딩하여 저장

**LLM 컨텍스트 구성 변경**: 검색된 자식 청크의 `parent_id`로 부모 섹션 텍스트를 Neo4j에서 조회하여 LLM에 전달

```python
# chat/service.py — 컨텍스트 구성 시
async def _expand_to_parent(chunks: list[dict]) -> list[dict]:
    """검색된 자식 청크 → 부모 섹션으로 확장"""
    parent_ids = list(set(c.get("parent_id") for c in chunks if c.get("parent_id")))
    if not parent_ids:
        return chunks

    with get_neo4j_session() as session:
        result = session.run("""
            UNWIND $ids AS pid
            MATCH (c:Chunk {id: pid})
            RETURN c.id AS id, c.text AS text
        """, ids=parent_ids)
        parent_map = {r["id"]: r["text"] for r in result}

    # 부모 텍스트로 대체 (중복 부모는 1회만)
    seen = set()
    expanded = []
    for chunk in chunks:
        pid = chunk.get("parent_id")
        if pid and pid not in seen and pid in parent_map:
            seen.add(pid)
            expanded.append({**chunk, "text": parent_map[pid]})
        elif not pid:
            expanded.append(chunk)
    return expanded
```

---

## Phase 2: 품질 강화

### 2-1. 프롬프트 엔지니어링

**변경**: 시스템 프롬프트에 출처 표기 강제 + Chain-of-Thought 유도

```python
# chat/prompt.py (신규)
SYSTEM_PROMPT = """당신은 사내 문서 기반 질의응답 어시스턴트입니다.

## 규칙
1. 반드시 제공된 문서 내용만을 근거로 답변하세요.
2. 답변의 각 주장마다 [출처: 파일명] 형태로 근거를 표기하세요.
3. 문서에 없는 내용은 "제공된 문서에서 해당 정보를 찾을 수 없습니다"라고 답하세요.
4. 먼저 관련 내용을 정리한 뒤 최종 답변을 작성하세요.

## 참고 문서
{context}

## 관련 엔티티 및 관계
{entities}
"""
```

### 2-2. 사내 용어 사전 (동의어 매핑)

**근거**: 동의어 매핑을 추가하면 검색 재현율(recall)이 크게 향상됨

```python
# core/glossary.py (신규)
# 초기에는 JSON 파일 기반, 이후 관리 UI 추가 가능
GLOSSARY_PATH = "glossary.json"

def load_glossary() -> dict[str, list[str]]:
    """{"KPI": ["핵심성과지표", "성과 지표", "key performance indicator"], ...}"""
    ...

def expand_query(question: str, glossary: dict) -> str:
    """질문에 포함된 용어의 동의어를 추가하여 검색 범위 확대"""
    ...
```

**적용 위치**: `retrieve_context()` 진입 시 질문 확장 → Graph 검색 + 벡터 검색 모두에 반영

---

## Phase 3: 운영 최적화

### 3-1. 시맨틱 캐시

**목적**: 유사한 질문에 대한 반복 검색/생성 비용 절감

```python
# core/cache.py (신규)
class SemanticCache:
    """Qdrant의 별도 컬렉션에 (질문 임베딩, 응답) 쌍 저장"""
    COLLECTION = "query_cache"
    SIMILARITY_THRESHOLD = 0.92

    async def get(self, question: str) -> str | None:
        """임계값 이상 유사 질문이 있으면 캐시된 응답 반환"""
        ...

    async def put(self, question: str, answer: str) -> None:
        """질문-응답 쌍을 캐시에 저장"""
        ...
```

### 3-2. Golden Set 평가 체계

**목적**: 최적화 전후 성능을 정량적으로 비교

```python
# tests/eval_rag.py (신규)
# golden_set.json: [{"question": "...", "expected_answer": "...", "source_doc": "..."}, ...]
#
# 평가 지표:
#   - 검색 정확도: 기대 문서가 Top-5에 포함되는 비율
#   - 응답 관련성: LLM-as-Judge (Ollama로 0~5점 채점)
#   - 출처 정확도: 응답의 [출처] 태그가 실제 검색 결과와 일치하는 비율
```

### 3-3. 도메인 Fine-tuning (장기)

- Ollama의 Modelfile을 활용한 시스템 프롬프트 커스터마이징
- 사내 문서 스타일에 맞춘 LoRA 어댑터 (Ollama 지원 시)
- **현재 단계에서는 프롬프트 엔지니어링으로 대체**, 추후 평가 결과에 따라 진행 여부 결정

---

## 구현 순서

### Phase 0 (사전 조건 — 가장 먼저)
1. `backend/app/core/db.py` — Neo4j 인덱스/제약조건 자동 생성 (`init_neo4j_schema`)
2. `ingestion/ontology_builder.py` — 한글 NER 패턴 추가 + `UNWIND` 배치 쿼리
3. `backend/app/documents/service.py` — 트랜잭션 처리 + Qdrant 롤백 + 중복 감지 + 파일 검증
4. `backend/app/documents/service.py` + `ingestion/embedder.py` — Ollama 재시도 로직 (`tenacity`)

### Phase 1 (핵심 — Phase 0 완료 후)
5. `ingestion/chunker.py` — 계층적 청킹 (`ChunkNode` 구조)
6. `ingestion/ontology_builder.py` — Neo4j 스키마 확장 (전체 텍스트 + NEXT 관계 + 엔티티 간 관계)
7. `backend/app/documents/service.py` — 인제스트 파이프라인에 계층적 청킹 적용
8. `backend/app/chat/service.py` — Graph-first 검색 전략 + 부모 청크 확장

### Phase 2 (품질 — Phase 1 완료 후)
9. `backend/app/chat/prompt.py` — 프롬프트 템플릿 (출처 표기 + CoT)
10. `backend/app/core/glossary.py` — 사내 용어 사전
11. `backend/app/chat/service.py` — 프롬프트 적용 + 쿼리 확장 통합

### Phase 3 (운영 — Phase 2 완료 후)
12. `backend/app/core/cache.py` — 시맨틱 캐시
13. `tests/golden_set.json` + `tests/eval_rag.py` — 평가 체계
14. 도메인 Fine-tuning 검토 (평가 결과 기반 판단)

---

## 위험 요소

| 위험 | 완화 방법 |
|------|---------|
| Phase 0 적용 후 기존 데이터 인덱스 미적용 | `init_neo4j_schema` 실행 시 기존 노드에도 인덱스 자동 소급 적용 (`IF NOT EXISTS` 사용) |
| 중복 감지 도입 후 동일 문서 업데이트 불가 | 파일 해시 외 `force=true` 파라미터로 재인제스트 허용 옵션 추가 |
| 한글 NER 패턴 오탐 (일반 단어 엔티티 처리) | 엔티티 최소 길이 조건, 불용어 사전 적용 |
| Neo4j에 전체 텍스트 저장 시 메모리 증가 | `deploy.resources.limits.memory` 조정 (3GB → 4GB), 인덱스 추가 |
| Graph-first 검색 시 키워드 추출 품질 | 초기에는 단순 형태소 기반, 추후 LLM 기반 추출로 개선 |
| 계층적 청킹 시 섹션 분할 정확도 | PDF 구조가 불규칙할 경우 폴백으로 기존 고정 크기 분할 유지 |
| 기존 인제스트 데이터와 호환성 | 마이그레이션 스크립트 제공 또는 재인제스트 안내 |
| 시맨틱 캐시 무효화 | 문서 재인제스트 시 관련 캐시 자동 삭제 |

---

## 검증 방법

### Phase 0
- [ ] Neo4j 인덱스: `SHOW INDEXES` 실행 → `document_id`, `chunk_id`, `entity_name`, `entity_search` 인덱스 확인
- [ ] 트랜잭션: 인제스트 중 Neo4j를 의도적으로 중단 → Qdrant에 고아 데이터 없는지 확인
- [ ] 중복 감지: 동일 PDF 2회 업로드 → `{"status": "duplicate"}` 응답 확인
- [ ] 재시도: Ollama 컨테이너 30초 중단 후 임베딩 요청 → 자동 재시도 후 성공 확인
- [ ] 한글 NER: 한글 PDF 인제스트 후 Neo4j `MATCH (e:Entity) RETURN e.name LIMIT 20` → 한글 엔티티 포함 여부 확인

### Phase 1
- [ ] 계층적 청킹: PDF 인제스트 후 Neo4j에서 `(:Chunk {level: "section"})-[:HAS_CHILD]->(:Chunk {level: "paragraph"})` 관계 확인
- [ ] Graph-first 검색: 구조적 질문("매출 KPI는?") → 관련 엔티티 기반 청크가 Top-5에 포함
- [ ] 부모 확장: 검색된 문단 청크 → LLM에 전달된 컨텍스트가 섹션 단위인지 확인

### Phase 2
- [ ] 프롬프트: 응답에 `[출처: 파일명]` 태그 포함 여부
- [ ] 용어 사전: "KPI" 검색 시 "핵심성과지표" 포함 문서도 검색되는지 확인

### Phase 3
- [ ] 시맨틱 캐시: 동일/유사 질문 재질의 시 응답 시간 단축 확인
- [ ] Golden set: `python eval_rag.py` 실행 → 정확도/관련성 점수 출력
