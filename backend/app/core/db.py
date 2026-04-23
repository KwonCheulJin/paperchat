import chromadb
import sqlite3
from app.core.config import settings
import os

_chroma_client = None
_chroma_collection = None
_sqlite_conn: sqlite3.Connection | None = None


def get_chroma() -> chromadb.Collection:
    global _chroma_client, _chroma_collection
    if _chroma_collection is None:
        os.makedirs(settings.chroma_path, exist_ok=True)
        # 오프라인 앱이므로 chromadb의 posthog telemetry 비활성화
        # (네트워크 호출 실패 시 대기·크래시 요인 제거)
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_path,
            settings=chromadb.Settings(anonymized_telemetry=False),
        )
        _chroma_collection = _chroma_client.get_or_create_collection(
            name=settings.chroma_collection,
            metadata={"hnsw:space": "cosine"},
        )
    return _chroma_collection


def get_sqlite() -> sqlite3.Connection:
    global _sqlite_conn
    if _sqlite_conn is None:
        os.makedirs(os.path.dirname(settings.sqlite_path), exist_ok=True)
        _sqlite_conn = sqlite3.connect(settings.sqlite_path, check_same_thread=False)
        _sqlite_conn.execute("PRAGMA journal_mode=WAL")
        _sqlite_conn.execute("PRAGMA synchronous=NORMAL")
        _sqlite_conn.execute("PRAGMA foreign_keys=ON")
    return _sqlite_conn


def init_db_schema() -> None:
    """앱 시작 시 한 번 호출. 테이블 없으면 생성."""
    conn = get_sqlite()

    # ── 선행 마이그레이션: 기존 테이블에 누락된 컬럼 추가 ─────────────────────
    # 아래 FTS5 마이그레이션이 documents.migration_status 컬럼을 사용하므로,
    # ALTER TABLE 은 반드시 그 전에 실행돼야 한다.
    # (v0.5.1 이하 구 DB 업그레이드 시 컬럼이 없어 UPDATE 크래시하던 버그 수정)
    doc_table_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='documents'"
    ).fetchone()
    if doc_table_exists:
        doc_cols = {row[1] for row in conn.execute("PRAGMA table_info(documents)").fetchall()}
        for col_name, col_def in [
            ("folder", "TEXT DEFAULT ''"),
            ("migration_status", "TEXT DEFAULT NULL"),
            ("embed_model", "TEXT DEFAULT ''"),
        ]:
            if col_name not in doc_cols:
                conn.execute(f"ALTER TABLE documents ADD COLUMN {col_name} {col_def}")

    metrics_table_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='metrics'"
    ).fetchone()
    if metrics_table_exists:
        metrics_cols = {row[1] for row in conn.execute("PRAGMA table_info(metrics)").fetchall()}
        if "reranker_ms" not in metrics_cols:
            conn.execute("ALTER TABLE metrics ADD COLUMN reranker_ms INTEGER")

    conn.commit()

    # FTS5 마이그레이션: content-backed → standalone
    # content= 스펙은 chunks 테이블과 동기화를 가정하므로 para_text 별도 저장 불가.
    # standalone FTS5로 교체하고 기존 문서는 백그라운드 재인덱싱.
    fts_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
    ).fetchone()
    if fts_row and "content=" in (fts_row[0] or ""):
        conn.execute("DROP TABLE chunks_fts")
        # migration_status='done' 문서: FTS5 재인덱싱 필요 표시
        # migration_status IS NULL 문서: entity migration 완료 후 재인덱싱 예정
        conn.execute(
            "UPDATE documents SET migration_status='fts5_reindex'"
            " WHERE migration_status='done'"
        )
        conn.commit()

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            file_hash TEXT UNIQUE NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            folder TEXT DEFAULT '',
            ingested_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            text TEXT NOT NULL,
            level TEXT NOT NULL,
            parent_id TEXT,
            chunk_index INTEGER,
            FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            id UNINDEXED,
            text
        );
        CREATE TABLE IF NOT EXISTS graph_triples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            head TEXT NOT NULL,
            head_type TEXT,
            relation TEXT NOT NULL,
            tail TEXT NOT NULL,
            tail_type TEXT,
            confidence REAL DEFAULT 1.0,
            source_chunk_id TEXT,
            doc_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_graph_head ON graph_triples(head);
        CREATE INDEX IF NOT EXISTS idx_graph_tail ON graph_triples(tail);
        CREATE TABLE IF NOT EXISTS errors (
            code TEXT PRIMARY KEY,
            ts INTEGER NOT NULL,
            kind TEXT,
            message TEXT,
            stack TEXT,
            ctx_json TEXT
        );
        CREATE TABLE IF NOT EXISTS metrics (
            ts INTEGER,
            kind TEXT,
            ttft_ms INTEGER,
            tokens_per_s REAL,
            retrieval_ms INTEGER,
            cache_hit INTEGER
        );
        CREATE TABLE IF NOT EXISTS doc_entities (
            id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            value TEXT NOT NULL,
            context TEXT,
            chunk_id TEXT,
            FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_doc_entities_doc
            ON doc_entities(doc_id, entity_type);
        CREATE TABLE IF NOT EXISTS message_feedback (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            message_id TEXT NOT NULL,
            rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_session
            ON message_feedback(session_id);
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT DEFAULT (datetime('now')),
            description TEXT NOT NULL
        );
    """)

    # (컬럼 ALTER TABLE 은 위쪽 선행 마이그레이션에서 이미 처리됨)
    # executescript 의 CREATE TABLE IF NOT EXISTS 는 기존 테이블이 있으면 no-op
    # 이므로 처음 설치 케이스에서는 위 ALTER 블록이 스킵되고 여기서 전체 스키마가 생성됨.
    # 두 경로 모두 최종 스키마는 동일해야 한다.

    # 신규 DB 케이스: 방금 executescript 로 생성된 documents 에도 누락 컬럼이 있는지 확인
    # (향후 스키마 진화 시 동일 패턴 사용 가능한 idempotent 블록)
    doc_cols = {row[1] for row in conn.execute("PRAGMA table_info(documents)").fetchall()}
    for col_name, col_def in [
        ("folder", "TEXT DEFAULT ''"),
        ("migration_status", "TEXT DEFAULT NULL"),
        ("embed_model", "TEXT DEFAULT ''"),
    ]:
        if col_name not in doc_cols:
            conn.execute(f"ALTER TABLE documents ADD COLUMN {col_name} {col_def}")

    metrics_cols = {row[1] for row in conn.execute("PRAGMA table_info(metrics)").fetchall()}
    if "reranker_ms" not in metrics_cols:
        conn.execute("ALTER TABLE metrics ADD COLUMN reranker_ms INTEGER")

    # 스키마 버전 기록 (버전별 마이그레이션 추적)
    # v1: 초기 스키마 (documents/chunks/graph_triples/errors/metrics/doc_entities/message_feedback)
    # v2: folder·migration_status/reranker_ms 컬럼, FTS5 standalone 전환
    # v3: schema_version 테이블 도입
    # v4: embed_model 컬럼 (모델 교체 시 재임베딩 대상 식별)
    conn.executemany(
        "INSERT OR IGNORE INTO schema_version(version, description) VALUES(?,?)",
        [
            (1, "initial schema"),
            (2, "folder/migration_status/reranker_ms columns, FTS5 standalone"),
            (3, "schema_version table"),
            (4, "embed_model column for re-embedding detection"),
        ],
    )

    conn.commit()
