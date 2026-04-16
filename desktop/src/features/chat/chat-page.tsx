import { useState } from "react";
import { useChatStore } from "../../store/chat";
import FloatingSidebar from "./floating-sidebar";
import SessionSidebar from "./session-sidebar";
import MessageList from "./message-list";
import InputBar from "./input-bar";
import DocumentPanel from "../documents/document-panel";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { GlobalStyles } from "../../shared/ui/global-styles";

export default function ChatPage() {
  const [leftPinned, setLeftPinned] = useState(false);
  const [rightPinned, setRightPinned] = useState(false);
  const { sessions, activeSessionId } = useChatStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title ?? "paperchat";

  return (
    <>
      <GlobalStyles />
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: "var(--background)",
          color: "var(--foreground)",
          overflow: "hidden",
        }}
      >
        {/* Left sidebar */}
        <FloatingSidebar
          side="left"
          pinned={leftPinned}
        >
          <SessionSidebar />
        </FloatingSidebar>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            height: "100%",
          }}
        >
          {/* TopBar breadcrumb */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              height: 44,
              borderBottom: "1px solid var(--surface-2)",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tb
                icon={I.sidebarL}
                tip={leftPinned ? "사이드바 해제" : "사이드바 고정"}
                onClick={() => setLeftPinned((v) => !v)}
                act={leftPinned}
                activeColor="var(--primary)"
              />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>paperchat</span>
              <span style={{ fontSize: 13, color: "var(--input)" }}>/</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sessionTitle}
              </span>
            </div>
            <Tb
              icon={I.sidebarR}
              tip={rightPinned ? "문서 패널 해제" : "문서 패널 고정"}
              onClick={() => setRightPinned((v) => !v)}
              act={rightPinned}
              activeColor="var(--primary)"
            />
          </div>

          {/* Message area */}
          <MessageList onRightPanelToggle={() => setRightPinned((v) => !v)} />

          {/* Input */}
          <InputBar onFolderToggle={() => setRightPinned((v) => !v)} />
        </div>

        {/* Right sidebar */}
        <FloatingSidebar
          side="right"
          pinned={rightPinned}
        >
          <DocumentPanel onClose={() => setRightPinned(false)} />
        </FloatingSidebar>
      </div>
    </>
  );
}
