import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

const INTERACTIVE_SELECTOR = "button, input, textarea, a, select, [role='button']";

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SELECTOR) !== null;
}

export const dragRegionHandlers = {
  onMouseDown: (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (isInteractive(e.target)) return;
    getCurrentWindow().startDragging();
  },
  onDoubleClick: (e: MouseEvent<HTMLElement>) => {
    if (isInteractive(e.target)) return;
    getCurrentWindow().toggleMaximize();
  },
};
