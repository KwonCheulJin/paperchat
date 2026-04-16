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

  return (
    <div
      role="status"
      aria-label="AI 응답 생성 중"
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}
    >
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--text-dim)",
              animation: `tp 1.2s ease-in-out ${i * 0.2}s infinite`,
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
