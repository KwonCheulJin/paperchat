import { useState } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";

type Tab = "chat" | "settings" | "code";

const MENU_ITEMS = [
  { icon: I.chat, label: "새 채팅", action: "new" as const },
  { icon: I.projects, label: "프로젝트", action: "projects" as const },
  { icon: I.customize, label: "설정", action: "settings" as const },
  { icon: I.artifacts, label: "아티팩트", action: "artifacts" as const },
];

export default function SessionSidebar() {
  const { sessions, activeSessionId, createSession, setActiveSession, deleteSession } =
    useChatStore();
  const [tab, setTab] = useState<Tab>("chat");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const tabs: { id: Tab; icon: React.ReactNode; tip: string }[] = [
    { id: "chat", icon: I.chat, tip: "채팅" },
    { id: "settings", icon: I.settings, tip: "설정" },
    { id: "code", icon: I.code, tip: "코드" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0c0d10",
        overflow: "hidden",
      }}
    >
      {/* Header: logo + tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 8px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#d4d4d8",
            letterSpacing: "0.02em",
          }}
        >
          paperchat
        </span>
        <div style={{ display: "flex", gap: 1 }}>
          {tabs.map((t) => (
            <Tb
              key={t.id}
              icon={t.icon}
              tip={t.tip}
              onClick={() => setTab(t.id)}
              act={tab === t.id}
              activeColor="#a78bfa"
            />
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <>
          {/* Menu items */}
          <div style={{ padding: "4px 8px 8px", flexShrink: 0 }}>
            {MENU_ITEMS.map((item) => {
              const isEnabled = item.action === "new";
              return (
                <button
                  key={item.label}
                  onClick={isEnabled ? createSession : undefined}
                  disabled={!isEnabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderRadius: 7,
                    padding: "7px 8px",
                    fontSize: 13,
                    color: isEnabled ? "#71717a" : "#3f3f46",
                    cursor: isEnabled ? "pointer" : "not-allowed",
                    textAlign: "left",
                    transition: "background 0.12s, color 0.12s",
                    opacity: isEnabled ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => {
                    if (isEnabled) {
                      e.currentTarget.style.background = "#18181b";
                      e.currentTarget.style.color = "#a1a1aa";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isEnabled) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#71717a";
                    }
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div style={{ height: 1, background: "#1f1f23", flexShrink: 0, margin: "0 8px" }} />

          {/* Pinned section */}
          <div style={{ padding: "10px 14px 4px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                고정됨
              </span>
              {I.pin}
            </div>
            <p style={{ fontSize: 11, color: "#3f3f46", margin: "6px 0 0", lineHeight: 1.4 }}>
              세션을 드래그하여 고정
            </p>
          </div>

          <div style={{ height: 1, background: "#1f1f23", flexShrink: 0, margin: "8px 8px 0" }} />

          {/* Recents */}
          <div style={{ padding: "10px 14px 4px", flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              최근
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "2px 8px" }}>
            {sessions.length === 0 && (
              <p style={{ fontSize: 11, color: "#3f3f46", textAlign: "center", padding: "16px 8px" }}>
                대화를 시작하세요
              </p>
            )}
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isHovered = hoveredId === session.id;
              return (
                <div
                  key={session.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 7,
                    padding: "7px 8px",
                    marginBottom: 1,
                    cursor: "pointer",
                    background: isActive ? "#18181b" : isHovered ? "#18181b" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onClick={() => setActiveSession(session.id)}
                  onMouseEnter={() => setHoveredId(session.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: isActive ? "#d4d4d8" : "#71717a",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: isHovered ? 22 : 0,
                      transition: "color 0.1s",
                    }}
                  >
                    {session.title}
                  </span>
                  {isHovered && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      style={{
                        position: "absolute",
                        right: 6,
                        background: "transparent",
                        border: "none",
                        padding: "2px",
                        cursor: "pointer",
                        color: "#52525b",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 4,
                        transition: "color 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
                      title="삭제"
                    >
                      {I.trash}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "settings" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 12, color: "#3f3f46" }}>설정 준비 중</p>
        </div>
      )}

      {tab === "code" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 12, color: "#3f3f46" }}>코드 보기 준비 중</p>
        </div>
      )}

      {/* User footer */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid #1f1f23",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#1f1f23",
            border: "1px solid #27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {I.user}
        </div>
        <span style={{ fontSize: 12, color: "#52525b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          사용자
        </span>
      </div>
    </div>
  );
}
