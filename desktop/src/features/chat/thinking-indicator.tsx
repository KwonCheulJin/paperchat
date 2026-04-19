import { useChatStore } from "../../store/chat";

const PHASE_LABELS: Record<string, string> = {
  fetching: "문서 검색 중...",
  generating: "응답 생성 중...",
};

const BARS = [
  { id: "bar-1", height: 8, delay: 0 },
  { id: "bar-2", height: 13, delay: 0.18 },
  { id: "bar-3", height: 10, delay: 0.36 },
];

export default function ThinkingIndicator() {
  const streamingPhase = useChatStore((s) => s.streamingPhase);
  const label = PHASE_LABELS[streamingPhase ?? ""] ?? "처리 중...";

  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
        {BARS.map(({ id, height, delay }) => (
          <div
            key={id}
            style={{
              width: 2,
              height,
              borderRadius: 1,
              background: "var(--primary)",
              transformOrigin: "center",
              animation: `bar 1.4s cubic-bezier(0.4, 0, 0.6, 1) ${delay}s infinite`,
            }}
          />
        ))}
      </div>
      <span style={{ color: "var(--text-dim)", fontSize: 12, animation: "fi 0.4s ease" }}>
        {label}
      </span>
    </div>
  );
}
