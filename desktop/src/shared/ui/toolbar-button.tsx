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
        background: hovered && !disabled ? "rgba(255,255,255,0.06)" : "transparent",
        border: "none",
        borderRadius: 5,
        padding: "3px 5px",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#3f3f46" : act ? (activeColor ?? "#a78bfa") : hovered ? "#a1a1aa" : "#52525b",
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
