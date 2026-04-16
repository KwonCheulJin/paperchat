import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";

// TODO: GET /profiles 엔드포인트 구현 후 API에서 동적 로드로 교체
const PROFILES = [
  { value: "internal-general", label: "사내 범용" },
  { value: "private-equity", label: "사모펀드 투자 분석" },
  { value: "legal", label: "법무 계약서 검토" },
  { value: "research", label: "R&D 기술 문서" },
];

export default function ProfileSelector() {
  const { profile, setProfile } = useChatStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12,
          color: "var(--text-muted)",
          cursor: "pointer",
          transition: "color 0.15s, border-color 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.borderColor = "var(--input)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        <span>{current.label}</span>
        {I.chevDown}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "4px",
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 200,
            animation: "fi 0.15s ease",
          }}
        >
          {PROFILES.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setProfile(p.value);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: p.value === profile ? "var(--surface-2)" : "transparent",
                border: "none",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 12,
                color: p.value === profile ? "var(--foreground)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => {
                if (p.value !== profile) {
                  e.currentTarget.style.background = "var(--surface-2)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (p.value !== profile) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
