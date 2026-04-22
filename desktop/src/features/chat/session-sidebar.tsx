import { useState } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import { PROFILES } from "../../shared/profiles";
import { cn } from "@/lib/utils";

export default function SessionSidebar() {
  const { sessions, activeSessionId, createSession, setActiveSession, deleteSession, profile } =
    useChatStore();
  const activeProfileLabel = PROFILES.find((p) => p.value === profile)?.label ?? "";
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex flex-col h-full bg-sidebar overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[14px] pt-[14px] pb-2 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-dim)] tracking-[0.1em] uppercase">
          paperchat
        </span>
      </div>

      {/* 새 채팅 */}
      <div className="px-2 pb-2 shrink-0">
        <button
          onClick={createSession}
          className="flex items-center gap-[9px] w-full bg-transparent border-none rounded-[3px] px-2 py-[7px] text-[13px] text-[var(--text-muted)] cursor-pointer text-left font-[inherit] transition-colors duration-[120ms] hover:bg-card hover:text-[var(--text-secondary)]"
        >
          {I.chat}
          <span>새 채팅</span>
        </button>
      </div>

      <div className="h-px bg-[var(--surface-2)] shrink-0 mx-2" />

      {/* Search */}
      {sessions.length > 0 && (
        <div className="px-2 pt-[6px] pb-[2px] shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="대화 검색..."
            className="w-full bg-card border border-border rounded-[3px] px-[10px] py-[5px] text-[12px] text-foreground outline-none font-[inherit] transition-colors duration-[120ms] focus:border-primary/40"
          />
        </div>
      )}

      {/* Recents label */}
      <div className="px-[14px] pt-2 pb-1 shrink-0">
        <span className="text-[10px] font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">
          최근
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-[2px]" role="list">
        {sessions.length === 0 ? (
          <p className="text-[11px] text-[var(--text-dim)] text-center px-2 py-4">
            새 채팅을 눌러 시작하세요
          </p>
        ) : null}
        {(() => {
          const q = searchQuery.trim().toLowerCase();
          const filtered = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions;
          if (sessions.length > 0 && q && filtered.length === 0) {
            return (
              <p className="text-[11px] text-[var(--text-dim)] text-center px-2 py-4">
                일치하는 대화가 없습니다
              </p>
            );
          }
          return filtered.map((session) => {
            const isActive = session.id === activeSessionId;
            const isHovered = hoveredId === session.id;
            return (
              <div
                key={session.id}
                role="listitem"
                className={cn(
                  "relative rounded-[3px] mb-[1px] transition-colors duration-100",
                  isActive
                    ? "bg-[color-mix(in_oklch,var(--primary)_6%,var(--card))]"
                    : isHovered
                    ? "bg-card"
                    : "bg-transparent",
                )}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  type="button"
                  onClick={() => setActiveSession(session.id)}
                  aria-current={isActive ? "true" : undefined}
                  className="flex items-center w-full bg-transparent border-none px-2 py-[7px] rounded-[3px] cursor-pointer text-left font-[inherit]"
                >
                  <span className="flex-1 min-w-0" style={{ paddingRight: isHovered ? 22 : 0 }}>
                    <span
                      className={cn(
                        "block text-[13px] overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-100",
                        isActive ? "text-foreground" : "text-[var(--text-muted)]",
                      )}
                    >
                      {session.title}
                    </span>
                    {isActive && (
                      <span className="block text-[10px] text-[var(--text-dim)] mt-[1px] tracking-[0.01em]">
                        {activeProfileLabel}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: session.id, title: session.title });
                  }}
                  className={cn(
                    "absolute right-[6px] top-1/2 -translate-y-1/2 bg-transparent border-none p-[2px] cursor-pointer text-[var(--text-dim)] flex items-center rounded-[2px] transition-[color,opacity] duration-100 hover:text-destructive font-[inherit]",
                    isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                  )}
                  title="삭제"
                  aria-label="세션 삭제"
                >
                  {I.trash}
                </button>
              </div>
            );
          });
        })()}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="대화 삭제"
        description={`'${deleteTarget?.title ?? ""}'을 삭제하시겠습니까? 삭제 후 토스트에서 실행취소할 수 있습니다.`}
        actionLabel="삭제"
        onAction={() => {
          if (deleteTarget) deleteSession(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
