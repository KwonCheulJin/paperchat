# Golden Set

사모펀드 RAG 평가용 Q30 세트.

## 구조
- `questions.json` — 질문 30개 (단순 15 / 관계추론 10 / 복합 5)
- `docs/` — 평가용 PDF 문서 (별도 배치 필요)

## 문서 배치
아래 파일을 `tests/golden_set/docs/` 에 배치 후 인제스트:
- `sample_im.pdf` — 투자제안서(IM)
- `sample_lpa.pdf` — 조합약관(LPA)
- `sample_financial.pdf` — 재무제표
- `sample_portfolio.pdf` — 포트폴리오 현황
- `sample_risk.pdf` — 리스크 분석
- `sample_sensitivity.pdf` — 민감도 분석
- `sample_valuation.pdf` — 밸류에이션 보고서
- `sample_track_record.pdf` — 실적 보고서

## 평가 실행
```bash
cd tests
python eval_rag.py --questions golden_set/questions.json --backend http://127.0.0.1:8000
```
