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
          background: "#09090b",
          color: "#d4d4d8",
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
              borderBottom: "1px solid #1f1f23",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tb
                icon={I.sidebarL}
                tip={leftPinned ? "사이드바 해제" : "사이드바 고정"}
                onClick={() => setLeftPinned((v) => !v)}
                act={leftPinned}
                activeColor="#a78bfa"
              />
              <span style={{ fontSize: 13, color: "#52525b" }}>paperchat</span>
              <span style={{ fontSize: 13, color: "#3f3f46" }}>/</span>
              <span
                style={{
                  fontSize: 13,
                  color: "#a1a1aa",
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
              activeColor="#a78bfa"
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
