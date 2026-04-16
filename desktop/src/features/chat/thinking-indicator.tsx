import { useState, useEffect } from "react";

const LABELS = ["응답 생성 중...", "컨텍스트 검색 중...", "분석 중..."];

export default function ThinkingIndicator() {
  const [labelIdx, setLabelIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setLabelIdx((i) => (i + 1) % LABELS.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const BAR_HEIGHTS = [8, 13, 10];

  return (
    <div
      role="status"
      aria-label="AI 응답 생성 중"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}
    >
      {/* 수직 바 인디케이터 — transform/opacity 기반, 레이아웃 변경 없음 */}
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            style={{
              width: 2,
              height: h,
              borderRadius: 1,
              background: "var(--primary)",
              transformOrigin: "center",
              animation: `bar 1.4s cubic-bezier(0.4, 0, 0.6, 1) ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: 12, animation: "fi 0.4s ease" }}>
        {LABELS[labelIdx]}
      </span>
    </div>
  );
}
