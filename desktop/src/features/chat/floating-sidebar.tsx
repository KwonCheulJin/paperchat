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
          width: 240,
          transform: open
            ? "translateX(0)"
            : side === "left"
            ? "translateX(-100%)"
            : "translateX(100%)",
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, visibility 0.2s",
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
          overflow: "hidden",
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
