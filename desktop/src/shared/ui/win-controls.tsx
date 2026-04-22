import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export function WinControls() {
  const win = getCurrentWindow();

  return (
    <div className="flex items-center h-full shrink-0">
      <button
        className="flex items-center justify-center w-[46px] h-full text-[var(--text-muted)] hover:bg-white/[.07] hover:text-[var(--text-secondary)] transition-colors duration-100"
        onClick={() => win.minimize()}
        aria-label="최소화"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full text-[var(--text-muted)] hover:bg-white/[.07] hover:text-[var(--text-secondary)] transition-colors duration-100"
        onClick={() => win.toggleMaximize()}
        aria-label="최대화"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="0.5" y="0.5" width="9" height="9" />
        </svg>
      </button>
      <button
        className="flex items-center justify-center w-[46px] h-full text-[var(--text-muted)] hover:bg-red-500/75 hover:text-white transition-colors duration-100"
        onClick={() => invoke("close_app")}
        aria-label="닫기"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <line x1="1" y1="1" x2="10" y2="10" />
          <line x1="10" y1="1" x2="1" y2="10" />
        </svg>
      </button>
    </div>
  );
}
