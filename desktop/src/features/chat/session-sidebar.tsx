import { useState } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import { PROFILES } from "../../shared/profiles";

export default function SessionSidebar() {
  const { sessions, activeSessionId, createSession, setActiveSession, deleteSession, profile } =
    useChatStore();
  const activeProfileLabel = PROFILES.find((p) => p.value === profile)?.label ?? "";
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--sidebar)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 14px 8px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-dim)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          paperchat
        </span>
      </div>

      {/* 새 채팅 */}
      <div style={{ padding: "4px 8px 8px", flexShrink: 0 }}>
        <button
          onClick={createSession}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            background: "transparent",
            border: "none",
            borderRadius: 3,
            padding: "7px 8px",
            fontSize: 13,
            color: "var(--text-muted)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--card)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {I.chat}
          <span>새 채팅</span>
        </button>
      </div>

      <div style={{ height: 1, background: "var(--surface-2)", flexShrink: 0, margin: "0 8px" }} />

      {/* Search */}
      {sessions.length > 0 && (
        <div style={{ padding: "6px 8px 2px", flexShrink: 0 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="대화 검색..."
            style={{
              width: "100%",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "5px 10px",
              fontSize: 12,
              color: "var(--foreground)",
              boxSizing: "border-box",
              outline: "none",
              fontFamily: "inherit",
              transition: "border-color 0.12s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "color-mix(in oklch, var(--primary) 30%, var(--border))")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
      )}

      {/* Recents */}
      <div style={{ padding: "8px 14px 4px", flexShrink: 0 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          최근
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px" }} role="list">
        {sessions.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: "16px 8px" }}>
            새 채팅을 눌러 시작하세요
          </p>
        ) : null}
        {(() => {
          const q = searchQuery.trim().toLowerCase();
          const filtered = q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions;
          if (sessions.length > 0 && q && filtered.length === 0) {
            return (
              <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: "16px 8px" }}>
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
                style={{
                  position: "relative",
                  borderRadius: 3,
                  marginBottom: 1,
                  background: isActive
                    ? "color-mix(in oklch, var(--primary) 6%, var(--card))"
                    : isHovered
                    ? "var(--card)"
                    : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHoveredId(session.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  type="button"
                  onClick={() => setActiveSession(session.id)}
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: "7px 8px",
                    borderRadius: 3,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, paddingRight: isHovered ? 22 : 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13,
                        color: isActive ? "var(--foreground)" : "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        transition: "color 0.1s",
                      }}
                    >
                      {session.title}
                    </span>
                    {isActive && (
                      <span style={{
                        display: "block",
                        fontSize: 10,
                        color: "var(--text-dim)",
                        marginTop: 1,
                        letterSpacing: "0.01em",
                      }}>
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
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    padding: "2px",
                    cursor: "pointer",
                    color: "var(--text-dim)",
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 2,
                    opacity: isHovered ? 1 : 0,
                    pointerEvents: isHovered ? "auto" : "none",
                    transition: "color 0.1s, opacity 0.1s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--destructive)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
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
