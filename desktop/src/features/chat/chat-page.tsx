import { useState, useEffect } from "react";
import { useChatStore } from "../../store/chat";
import FloatingSidebar from "./floating-sidebar";
import SessionSidebar from "./session-sidebar";
import MessageList from "./message-list";
import InputBar from "./input-bar";
import DocumentPanel from "../documents/document-panel";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { GlobalStyles } from "../../shared/ui/global-styles";
import { PROFILES } from "../../shared/profiles";

export default function ChatPage() {
  const [leftPinned, setLeftPinned] = useState(false);
  const [rightPinned, setRightPinned] = useState(false);
  const { sessions, activeSessionId, activeFolder, setProfile } = useChatStore();

  useEffect(() => {
    const PROFILE_VALUES = PROFILES.map((p) => p.value);
    const handler = (e: KeyboardEvent) => {
      const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setRightPinned((v) => !v);
      }
      if (e.altKey && !isTyping && ["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) {
        const idx = parseInt(e.code.replace("Digit", "")) - 1;
        if (PROFILE_VALUES[idx]) setProfile(PROFILE_VALUES[idx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setProfile]);

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
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sessionTitle}
              </span>
              {activeFolder && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    background: "color-mix(in oklch, var(--primary) 12%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "var(--primary)",
                    flexShrink: 0,
                  }}
                  title="활성 폴더: 이 폴더 문서만 검색에 사용됩니다"
                >
                  <span style={{ display: "flex" }}>{I.folder}</span>
                  <span>{activeFolder}</span>
                </div>
              )}
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
