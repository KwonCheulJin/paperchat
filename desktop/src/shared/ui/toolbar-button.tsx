import { useState } from "react";

interface ToolbarButtonProps {
  icon: React.ReactNode;
  tip?: string;
  onClick?: () => void;
  act?: boolean;
  activeColor?: string;
  disabled?: boolean;
}

export function ToolbarButton({ icon, tip, onClick, act, activeColor, disabled }: ToolbarButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={tip}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !disabled ? "color-mix(in oklch, white 6%, transparent)" : "transparent",
        border: "none",
        borderRadius: 5,
        padding: "3px 5px",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "var(--input)" : act ? (activeColor ?? "var(--primary)") : hovered ? "var(--text-secondary)" : "var(--text-dim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s, background 0.15s",
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );
}

// 하위 호환 alias — 점진적 마이그레이션 중에 사용
export { ToolbarButton as Tb };
