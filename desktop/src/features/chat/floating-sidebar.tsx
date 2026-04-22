import { useState } from "react";
import { cn } from "@/lib/utils";

interface FloatingSidebarProps {
  side: "left" | "right";
  pinned: boolean;
  children: React.ReactNode;
  triggerWidth?: number;
}

/**
 * Pinned ↔ unpinned 전환과 hover slide-in을 동일한 cubic-bezier 200ms로 통일.
 * - 래퍼: 폭 transition (256 ↔ triggerWidth). flex-1 main이 자연스럽게 확장/축소.
 * - 카드: 항상 absolute (top-2 bottom-2 + left-2 or right-2). transform으로 슬라이드.
 *   · 좌측: -x(110%) → 0  (왼쪽에서 오른쪽으로 미끄러져 나옴)
 *   · 우측: +x(110%) → 0  (오른쪽에서 왼쪽으로 미끄러져 나옴)
 */
export default function FloatingSidebar({
  side,
  pinned,
  children,
  triggerWidth = 20,
}: FloatingSidebarProps) {
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  return (
    <div
      className="relative shrink-0 z-40 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ width: pinned ? 256 : triggerWidth }}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "absolute top-2 bottom-2 w-[240px] bg-sidebar rounded-xl border border-border flex flex-col overflow-hidden",
          "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform",
          side === "left" ? "left-2" : "right-2",
          open
            ? "translate-x-0 opacity-100"
            : side === "left"
            ? "-translate-x-[110%] opacity-0"
            : "translate-x-[110%] opacity-0",
          !pinned && open && side === "left" && "shadow-[4px_0_20px_rgba(0,0,0,0.5)]",
          !pinned && open && side === "right" && "shadow-[-4px_0_20px_rgba(0,0,0,0.5)]",
        )}
      >
        <div className="w-full h-full flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
