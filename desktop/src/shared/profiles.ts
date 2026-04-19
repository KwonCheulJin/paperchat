export const PROFILES = [
  {
    value: "internal-general",
    label: "사내 범용",
    desc: "일반 업무 문서 질의응답",
    suggestions: ["업무 문서 핵심 내용을 요약해주세요", "주요 항목을 찾아주세요"],
    subtitle: "업무 문서에 대해 질문하세요",
  },
  {
    value: "private-equity",
    label: "사모펀드 투자 분석",
    desc: "재무·IR·투자 보고서 전문",
    suggestions: ["이 IR 자료의 핵심 지표를 요약해주세요", "투자 리스크 요인을 분석해주세요"],
    subtitle: "투자·재무 문서에 대해 질문하세요",
  },
  {
    value: "legal",
    label: "법무 계약서 검토",
    desc: "계약·규정·법령 문서 전문",
    suggestions: ["계약서 주요 조항을 분석해주세요", "위험 조항이나 독소 조항을 찾아주세요"],
    subtitle: "계약서 조항을 검토해드립니다",
  },
  {
    value: "research",
    label: "R&D 기술 문서",
    desc: "기술 논문·매뉴얼 전문",
    suggestions: ["이 논문의 핵심 주장과 방법론을 요약해주세요", "기술적 한계나 미래 연구 방향을 찾아주세요"],
    subtitle: "기술 문서·논문을 분석해드립니다",
  },
] as const;

export type ProfileValue = (typeof PROFILES)[number]["value"];
