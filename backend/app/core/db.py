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
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_path)
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
            text,
            content='chunks',
            content_rowid='rowid'
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
    """)

    # 마이그레이션: 기존 DB에 folder 컬럼이 없으면 추가
    existing_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(documents)").fetchall()
    }
    if "folder" not in existing_cols:
        conn.execute("ALTER TABLE documents ADD COLUMN folder TEXT DEFAULT ''")
    if "migration_status" not in existing_cols:
        conn.execute("ALTER TABLE documents ADD COLUMN migration_status TEXT DEFAULT NULL")

    conn.commit()
