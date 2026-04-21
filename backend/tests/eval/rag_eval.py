"""
Hit@K / MRR 평가 스크립트.

사용법:
    cd backend
    python -m tests.eval.rag_eval [--folder FOLDER] [--top-k 5] [--verbose]

사전 조건:
    - 백엔드 DB에 문서가 인제스트되어 있어야 함
    - golden_qa.json의 keywords가 실제 문서 내용과 일치해야 함

평가 방식:
    - Soft Hit: retrieved top-K 청크 중 하나라도 Q&A keywords가 모두 포함되면 Hit
    - MRR: 첫 번째 hit 순위의 역수 평균
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# backend 루트를 sys.path에 추가
_BACKEND_ROOT = Path(__file__).parent.parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

os.environ.setdefault("APP_ENV", "test")


def _load_golden_qa() -> list[dict]:
    qa_path = Path(__file__).parent / "golden_qa.json"
    with open(qa_path, encoding="utf-8") as f:
        return json.load(f)


def _soft_hit(chunks: list[dict], keywords: list[str]) -> int | None:
    """top-K 청크에서 첫 번째 hit 순위 반환 (1-based). 없으면 None."""
    for rank, chunk in enumerate(chunks, start=1):
        text = (chunk.get("text") or "").lower()
        if all(kw.lower() in text for kw in keywords):
            return rank
    return None


def run_evaluation(folder: str | None = None, top_k: int = 5, verbose: bool = False) -> dict:
    """
    전체 Golden Q&A에 대해 Hit@K / MRR 계산.

    반환:
        {
            "hit_at_k": float,
            "mrr": float,
            "top_k": int,
            "total": int,
            "hits": int,
            "details": [...]
        }
    """
    from app.core.db import init_db_schema
    from app.services.hybrid_search import hybrid_search
    from app.services.reranker import rerank

    init_db_schema()

    qa_list = _load_golden_qa()
    total = len(qa_list)
    hits = 0
    rr_sum = 0.0
    details = []

    for qa in qa_list:
        qid = qa["id"]
        question = qa["question"]
        keywords = qa.get("keywords", [])

        try:
            candidates = hybrid_search(question, folder=folder)
            ranked = rerank(question, candidates, top_k=top_k)
        except Exception as exc:
            details.append({"id": qid, "hit": False, "rank": None, "error": str(exc)})
            if verbose:
                print(f"  [{qid}] ERROR: {exc}")
            continue

        rank = _soft_hit(ranked, keywords)
        hit = rank is not None
        if hit:
            hits += 1
            rr_sum += 1.0 / rank

        details.append({
            "id": qid,
            "question": question[:60],
            "keywords": keywords,
            "hit": hit,
            "rank": rank,
            "doc_type": qa.get("doc_type", ""),
        })

        if verbose:
            status = f"HIT @{rank}" if hit else "MISS"
            print(f"  [{qid}] {status:10s} | {question[:50]}")

    hit_rate = hits / total if total > 0 else 0.0
    mrr = rr_sum / total if total > 0 else 0.0

    return {
        "hit_at_k": round(hit_rate, 4),
        "mrr": round(mrr, 4),
        "top_k": top_k,
        "total": total,
        "hits": hits,
        "details": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="paperchat RAG Hit@K / MRR 평가")
    parser.add_argument("--folder", default=None, help="검색 범위 폴더 (없으면 전체)")
    parser.add_argument("--top-k", type=int, default=5, help="평가 기준 K (기본: 5)")
    parser.add_argument("--verbose", action="store_true", help="Q&A별 상세 출력")
    args = parser.parse_args()

    print(f"\n=== paperchat RAG 평가 (Hit@{args.top_k} / MRR) ===")
    if args.folder:
        print(f"  폴더 필터: {args.folder}")
    print()

    result = run_evaluation(folder=args.folder, top_k=args.top_k, verbose=args.verbose)

    print(f"\n{'='*45}")
    print(f"  Hit@{result['top_k']:2d}  : {result['hit_at_k']:.1%}  ({result['hits']}/{result['total']})")
    print(f"  MRR     : {result['mrr']:.4f}")
    print(f"{'='*45}\n")

    out_path = Path(__file__).parent / "eval_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"결과 저장: {out_path}")


if __name__ == "__main__":
    main()
