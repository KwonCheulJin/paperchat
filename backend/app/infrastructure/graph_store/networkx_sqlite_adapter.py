"""
그래프 스토어 — SQLite (영속성) + NetworkX (인메모리 경로 탐색).
GraphStorePort 어댑터.

설계:
- SQLite graph_triples 테이블에 (head, relation, tail) 저장
- 앱 시작 시 NetworkX 그래프로 로드 (pickle 캐시)
- 청크 단위 commit으로 중단/재개 안전
- 상한: 1만 노드 정상 / 5만 노드 경고

트리플 예시:
  head="A펀드", relation="투자", tail="B포트폴리오사"
  head="B포트폴리오사", relation="보고서", tail="2024Q3 분기보고서_p3_s1 (chunk_id)"
"""
from __future__ import annotations

import os
import pickle

import networkx as nx

from app.core.db import get_sqlite
from app.core.logging_config import get_logger
from app.domain.ontology.ports import GraphStorePort

logger = get_logger(__name__)

_GRAPH_CACHE_PATH = "./data/graph.pkl"
NODE_WARN_THRESHOLD = 10_000
NODE_ERROR_THRESHOLD = 50_000

_graph: nx.DiGraph | None = None


def _load_graph() -> nx.DiGraph:
    """SQLite → NetworkX 로드 (pickle 캐시 활용)."""
    global _graph
    if _graph is not None:
        return _graph

    if os.path.exists(_GRAPH_CACHE_PATH):
        try:
            with open(_GRAPH_CACHE_PATH, "rb") as f:
                g = pickle.load(f)  # noqa: S301 — internal data from our own SQLite
            if isinstance(g, nx.DiGraph):
                _graph = g
                logger.info("graph_loaded_from_cache", nodes=g.number_of_nodes())
                return _graph
        except Exception:
            pass

    _graph = _rebuild_graph_from_sqlite()
    _save_cache(_graph)
    return _graph


def _rebuild_graph_from_sqlite() -> nx.DiGraph:
    conn = get_sqlite()
    rows = conn.execute(
        "SELECT head, relation, tail, confidence, source_chunk_id FROM graph_triples"
    ).fetchall()
    g = nx.DiGraph()
    for head, relation, tail, confidence, chunk_id in rows:
        g.add_edge(head, tail, relation=relation, confidence=confidence or 1.0, chunk_id=chunk_id or "")
    logger.info("graph_rebuilt", nodes=g.number_of_nodes(), edges=g.number_of_edges())
    return g


def _save_cache(g: nx.DiGraph) -> None:
    os.makedirs(os.path.dirname(_GRAPH_CACHE_PATH) or ".", exist_ok=True)
    try:
        with open(_GRAPH_CACHE_PATH, "wb") as f:
            pickle.dump(g, f)  # noqa: S301 — serializing our own NetworkX graph
    except Exception as e:
        logger.warning("graph_cache_save_failed", error=str(e))


def _invalidate_cache() -> None:
    """그래프 변경 시 pickle 캐시 무효화."""
    global _graph
    _graph = None
    if os.path.exists(_GRAPH_CACHE_PATH):
        os.remove(_GRAPH_CACHE_PATH)


def add_triples(
    triples: list[dict],  # {"head", "head_type"?, "relation", "tail", "tail_type"?, "confidence"?, "source_chunk_id"?, "doc_id"?}
) -> None:
    """트리플 목록을 SQLite + NetworkX에 추가."""
    if not triples:
        return

    conn = get_sqlite()
    conn.executemany(
        """
        INSERT INTO graph_triples(head, head_type, relation, tail, tail_type, confidence, source_chunk_id, doc_id)
        VALUES(?,?,?,?,?,?,?,?)
        """,
        [
            (
                t["head"], t.get("head_type"), t["relation"], t["tail"],
                t.get("tail_type"), t.get("confidence", 1.0),
                t.get("source_chunk_id"), t.get("doc_id"),
            )
            for t in triples
        ],
    )
    conn.commit()

    g = _load_graph()
    for t in triples:
        g.add_edge(
            t["head"], t["tail"],
            relation=t["relation"],
            confidence=t.get("confidence", 1.0),
            chunk_id=t.get("source_chunk_id", ""),
        )

    n = g.number_of_nodes()
    if n > NODE_ERROR_THRESHOLD:
        logger.error("graph_too_large", nodes=n, threshold=NODE_ERROR_THRESHOLD)
    elif n > NODE_WARN_THRESHOLD:
        logger.warning("graph_large", nodes=n, threshold=NODE_WARN_THRESHOLD)

    _save_cache(g)
    logger.info("add_triples_done", count=len(triples), total_nodes=n)


def query_path(
    keywords: list[str],
    max_hops: int = 3,
    max_results: int = 5,
) -> list[dict]:
    """
    키워드로 매칭되는 노드에서 BFS 확장 → 연결된 chunk_id 반환.
    반환: [{"chunk_id", "path", "relations"}]
    """
    g = _load_graph()
    if g.number_of_nodes() == 0:
        return []

    seed_nodes = [
        n for n in g.nodes()
        if any(kw.lower() in str(n).lower() for kw in keywords)
    ]
    if not seed_nodes:
        return []

    chunk_ids_seen: set[str] = set()
    results: list[dict] = []

    for seed in seed_nodes[:5]:
        try:
            neighbors = nx.single_source_shortest_path(g, seed, cutoff=max_hops)
        except nx.NetworkXError:
            continue

        for target, path in list(neighbors.items())[:20]:
            chunk_id = None
            if "_s" in str(target) and "_p" in str(target):
                chunk_id = str(target)
            else:
                for u, v, data in g.edges(target, data=True):
                    if data.get("chunk_id"):
                        chunk_id = data["chunk_id"]
                        break

            if chunk_id and chunk_id not in chunk_ids_seen:
                chunk_ids_seen.add(chunk_id)
                relations = [
                    g.edges[path[i], path[i + 1]].get("relation", "")
                    for i in range(len(path) - 1)
                ]
                results.append({
                    "chunk_id": chunk_id,
                    "path": path,
                    "relations": relations,
                    "source": "graph",
                })
                if len(results) >= max_results:
                    return results

    return results


def delete_doc_triples(doc_id: str) -> None:
    """문서 관련 트리플 전체 삭제."""
    conn = get_sqlite()
    conn.execute("DELETE FROM graph_triples WHERE doc_id=?", (doc_id,))
    conn.commit()
    _invalidate_cache()
    logger.info("delete_doc_triples", doc_id=doc_id)


def get_graph_stats() -> dict:
    """그래프 통계 반환 (설정 화면용)."""
    g = _load_graph()
    return {
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "warn": g.number_of_nodes() > NODE_WARN_THRESHOLD,
        "error": g.number_of_nodes() > NODE_ERROR_THRESHOLD,
    }


class NetworkxSqliteAdapter(GraphStorePort):
    def add_triples(self, triples: list[dict]) -> None:
        add_triples(triples)

    def query_path(
        self,
        keywords: list[str],
        max_hops: int = 3,
        max_results: int = 5,
    ) -> list[dict]:
        return query_path(keywords, max_hops, max_results)

    def delete_doc_triples(self, doc_id: str) -> None:
        delete_doc_triples(doc_id)

    def get_graph_stats(self) -> dict:
        return get_graph_stats()
