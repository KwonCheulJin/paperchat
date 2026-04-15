"""
RAG 품질 평가 — RAGAS + DeepEval CI 게이트.

평가 지표:
- faithfulness >= 0.85    (답변이 문서에 근거하는지)
- context_precision >= 0.7 (검색된 컨텍스트의 정확도)
- answer_relevancy       (답변이 질문과 관련 있는지)
- context_recall         (정답에 필요한 컨텍스트가 검색됐는지)

실행 방법:
  python eval_rag.py [--questions path] [--backend url] [--profile name]

종료 코드:
  0: 모든 지표 통과
  1: 하나 이상 지표 미달
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

# --------------------------------------------------------------------------- #
# 임계값 상수
# --------------------------------------------------------------------------- #
THRESHOLD_FAITHFULNESS = 0.85
THRESHOLD_CONTEXT_PRECISION = 0.70


# --------------------------------------------------------------------------- #
# 답변 수집
# --------------------------------------------------------------------------- #
async def fetch_answer(question: str, backend_url: str, profile: str) -> dict:
    """SSE 스트리밍으로 답변과 소스 수집."""
    import httpx

    url = f"{backend_url}/chat/stream"
    payload = {"question": question, "profile": profile}

    answer_tokens: list[str] = []
    sources: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[len("data:"):].strip()
                    if raw in ("", "[DONE]"):
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("type", "token")
                    if event_type == "token":
                        answer_tokens.append(event.get("content", ""))
                    elif event_type == "sources":
                        for src in event.get("sources", []):
                            text = src.get("text") or src.get("content", "")
                            if text:
                                sources.append(text)
    except httpx.HTTPError as exc:
        print(f"  [ERROR] HTTP 오류: {exc}", file=sys.stderr)

    return {
        "answer": "".join(answer_tokens),
        "contexts": sources,
    }


# --------------------------------------------------------------------------- #
# RAGAS 평가
# --------------------------------------------------------------------------- #
def build_ragas_dataset(records: list[dict]):
    """RAGAS EvaluationDataset 구성."""
    from datasets import Dataset

    rows = {
        "question": [r["question"] for r in records],
        "answer": [r["answer"] for r in records],
        "contexts": [r["contexts"] for r in records],
        "ground_truth": [r["ground_truth"] for r in records],
    }
    return Dataset.from_dict(rows)


def run_ragas(dataset, llm):
    """RAGAS evaluate() 호출 후 결과 dict 반환."""
    from ragas import evaluate
    from ragas.metrics import (
        answer_relevancy,
        context_precision,
        context_recall,
        faithfulness,
    )

    result = evaluate(
        dataset=dataset,
        metrics=[faithfulness, context_precision, answer_relevancy, context_recall],
        llm=llm,
    )
    return result


# --------------------------------------------------------------------------- #
# DeepEval 게이트 (pytest 없이 직접 체크)
# --------------------------------------------------------------------------- #
def deepeval_gate(scores: dict) -> list[str]:
    """임계값 미달 지표 이름 목록 반환. 빈 리스트 = 전부 통과."""
    failures: list[str] = []
    if scores.get("faithfulness", 0.0) < THRESHOLD_FAITHFULNESS:
        failures.append(
            f"faithfulness={scores['faithfulness']:.3f} < {THRESHOLD_FAITHFULNESS}"
        )
    if scores.get("context_precision", 0.0) < THRESHOLD_CONTEXT_PRECISION:
        failures.append(
            f"context_precision={scores['context_precision']:.3f} < {THRESHOLD_CONTEXT_PRECISION}"
        )
    return failures


# --------------------------------------------------------------------------- #
# 결과 저장
# --------------------------------------------------------------------------- #
def save_results(scores: dict, records: list[dict], failures: list[str]) -> Path:
    timestamp = int(time.time())
    out_path = Path(f"eval_results_{timestamp}.json")
    payload = {
        "timestamp": timestamp,
        "scores": scores,
        "gate_failures": failures,
        "passed": len(failures) == 0,
        "num_questions": len(records),
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


# --------------------------------------------------------------------------- #
# 리포트 출력
# --------------------------------------------------------------------------- #
def print_report(scores: dict, failures: list[str], out_path: Path) -> None:
    print("\n" + "=" * 60)
    print("RAG 품질 평가 결과")
    print("=" * 60)
    for metric, value in scores.items():
        mark = "PASS" if isinstance(value, float) and value >= 0.0 else "N/A"
        if metric == "faithfulness" and value < THRESHOLD_FAITHFULNESS:
            mark = "FAIL"
        if metric == "context_precision" and value < THRESHOLD_CONTEXT_PRECISION:
            mark = "FAIL"
        print(f"  {metric:<25} {value:.3f}   [{mark}]")
    print("-" * 60)
    if failures:
        print("품질 게이트 실패:")
        for f in failures:
            print(f"  - {f}")
    else:
        print("모든 품질 게이트 통과")
    print(f"\n결과 저장: {out_path}")
    print("=" * 60 + "\n")


# --------------------------------------------------------------------------- #
# 메인 평가 루프
# --------------------------------------------------------------------------- #
async def run_evaluation(args) -> int:
    # 1. 질문 로드
    questions_path = Path(args.questions)
    if not questions_path.exists():
        print(f"[ERROR] 질문 파일을 찾을 수 없습니다: {questions_path}", file=sys.stderr)
        return 1

    with questions_path.open(encoding="utf-8") as f:
        golden = json.load(f)

    questions = golden["questions"]
    if args.subset != "all":
        questions = [q for q in questions if q["category"] == args.subset]

    print(f"평가 질문 수: {len(questions)} (subset={args.subset})")
    print(f"백엔드: {args.backend}")

    # 2. 각 질문 답변 수집
    records: list[dict] = []
    for i, item in enumerate(questions, 1):
        print(f"  [{i:02d}/{len(questions)}] {item['id']} 처리 중...")
        result = await fetch_answer(item["question"], args.backend, args.profile)
        records.append(
            {
                "id": item["id"],
                "question": item["question"],
                "answer": result["answer"],
                "contexts": result["contexts"] if result["contexts"] else ["(컨텍스트 없음)"],
                "ground_truth": item["ground_truth"],
            }
        )

    # 3. RAGAS LLM 설정 (Ollama OpenAI 호환 엔드포인트)
    from langchain_openai import ChatOpenAI
    from ragas.llms import LangchainLLMWrapper

    llm = LangchainLLMWrapper(
        ChatOpenAI(
            model="local",
            base_url="http://127.0.0.1:11434/v1",
            api_key="dummy",
            temperature=0,
        )
    )

    # 4. RAGAS 평가
    print("\nRagas 평가 실행 중...")
    dataset = build_ragas_dataset(records)
    ragas_result = run_ragas(dataset, llm)

    scores: dict = {
        "faithfulness": float(ragas_result["faithfulness"]),
        "context_precision": float(ragas_result["context_precision"]),
        "answer_relevancy": float(ragas_result["answer_relevancy"]),
        "context_recall": float(ragas_result["context_recall"]),
    }

    # 5. DeepEval 게이트
    failures = deepeval_gate(scores)

    # 6. 결과 저장
    out_path = save_results(scores, records, failures)

    # 7. 리포트 출력
    print_report(scores, failures, out_path)

    return 1 if failures else 0


# --------------------------------------------------------------------------- #
# 진입점
# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(description="RAG 품질 평가 스크립트")
    parser.add_argument(
        "--questions",
        default="golden_set/questions.json",
        help="Golden Set JSON 경로 (기본: golden_set/questions.json)",
    )
    parser.add_argument(
        "--backend",
        default="http://127.0.0.1:8000",
        help="백엔드 URL (기본: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--profile",
        default="private-equity",
        help="RAG 프로필 이름 (기본: private-equity)",
    )
    parser.add_argument(
        "--subset",
        choices=["factual", "relational", "complex", "all"],
        default="all",
        help="평가할 질문 카테고리 (기본: all)",
    )
    args = parser.parse_args()

    exit_code = asyncio.run(run_evaluation(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
