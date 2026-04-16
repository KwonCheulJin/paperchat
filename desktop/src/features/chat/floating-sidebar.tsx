import { useState } from "react";

interface FloatingSidebarProps {
  side: "left" | "right";
  pinned: boolean;
  children: React.ReactNode;
  triggerWidth?: number;
}

export default function FloatingSidebar({
  side,
  pinned,
  children,
  triggerWidth = 8,
}: FloatingSidebarProps) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  if (pinned) {
    return (
      <div
        style={{
          width: 240,
          flexShrink: 0,
          background: "var(--sidebar)",
          borderRight: side === "left" ? "1px solid var(--border)" : undefined,
          borderLeft: side === "right" ? "1px solid var(--border)" : undefined,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: triggerWidth,
        flexShrink: 0,
        zIndex: 50,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Floating panel */}
      <div
        style={{
          position: "absolute",
          [side]: 0,
          top: 0,
          bottom: 0,
          width: open ? 240 : 0,
          overflow: "hidden",
          transition: "width 0.2s ease",
          background: "var(--sidebar)",
          borderRight: side === "left" ? "1px solid var(--border)" : undefined,
          borderLeft: side === "right" ? "1px solid var(--border)" : undefined,
          boxShadow: open
            ? side === "left"
              ? "4px 0 20px rgba(0,0,0,0.5)"
              : "-4px 0 20px rgba(0,0,0,0.5)"
            : undefined,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            width: 240,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
