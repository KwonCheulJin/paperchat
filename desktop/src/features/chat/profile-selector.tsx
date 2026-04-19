import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { PROFILES } from "../../shared/profiles";

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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`프로필 선택: ${current.label}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "var(--surface-2)",
          border: "1px solid var(--input)",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 12,
          color: "var(--text-secondary)",
          cursor: "pointer",
          transition: "color 0.15s, border-color 0.15s, background 0.15s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--foreground)";
          e.currentTarget.style.borderColor = "var(--primary)";
          e.currentTarget.style.background = "color-mix(in oklch, var(--primary) 5%, var(--surface-2))";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-secondary)";
          e.currentTarget.style.borderColor = "var(--input)";
          e.currentTarget.style.background = "var(--surface-2)";
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
              <span style={{ display: "block" }}>{p.label}</span>
              <span style={{ display: "block", fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>{p.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
