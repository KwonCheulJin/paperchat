import { useState } from "react";
import { cn } from "@/lib/utils";

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
  triggerWidth = 20,
}: FloatingSidebarProps) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  if (pinned) {
    return (
      <div
        className={cn(
          "w-[240px] shrink-0 bg-sidebar h-full overflow-hidden flex flex-col",
          side === "left" ? "border-r border-border" : "border-l border-border",
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative shrink-0 z-50"
      style={{ width: triggerWidth }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "absolute top-0 bottom-0 w-[240px] bg-sidebar flex flex-col overflow-hidden",
          "transition-[transform,opacity,visibility] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
          side === "left" ? "left-0 border-r border-border" : "right-0 border-l border-border",
          open
            ? "translate-x-0 opacity-100 visible"
            : side === "left"
            ? "-translate-x-full opacity-0 invisible"
            : "translate-x-full opacity-0 invisible",
        )}
        style={{
          boxShadow: open
            ? side === "left"
              ? "4px 0 20px rgba(0,0,0,0.5)"
              : "-4px 0 20px rgba(0,0,0,0.5)"
            : undefined,
        }}
      >
        <div className="w-[240px] shrink-0 flex flex-col h-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
