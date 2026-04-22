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
import { WinControls } from "../../shared/ui/win-controls";
import { dragRegionHandlers } from "../../shared/ui/drag-region";
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
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        {/* Unified TitleBar — spans full width */}
        <div
          className="flex items-center justify-between h-11 shrink-0"
          {...dragRegionHandlers}
        >
          <div className="flex items-center gap-2 pl-3 min-w-0">
            <Tb
              icon={I.sidebarL}
              tip={leftPinned ? "사이드바 해제" : "사이드바 고정"}
              onClick={() => setLeftPinned((v) => !v)}
              act={leftPinned}
              activeColor="var(--primary)"
            />
            <span className="text-sm text-[var(--text-dim)]">paperchat</span>
            <span className="text-sm text-[var(--text-dim)]">/</span>
            <span className="text-sm text-[var(--text-secondary)] max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
              {sessionTitle}
            </span>
            {activeFolder && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs text-primary shrink-0"
                style={{
                  background: "color-mix(in oklch, var(--primary) 12%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
                }}
                title="활성 폴더: 이 폴더 문서만 검색에 사용됩니다"
              >
                <span className="flex">{I.folder}</span>
                <span>{activeFolder}</span>
              </div>
            )}
          </div>
          <div className="flex items-center h-full">
            <div className="pr-1">
              <Tb
                icon={I.sidebarR}
                tip={rightPinned ? "문서 패널 해제" : "문서 패널 고정"}
                onClick={() => setRightPinned((v) => !v)}
                act={rightPinned}
                activeColor="var(--primary)"
              />
            </div>
            <WinControls />
          </div>
        </div>

        {/* Body — flex row below titlebar */}
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar */}
          <FloatingSidebar side="left" pinned={leftPinned}>
            <SessionSidebar />
          </FloatingSidebar>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Message area */}
            <MessageList onRightPanelToggle={() => setRightPinned((v) => !v)} />

            {/* Input */}
            <InputBar onFolderToggle={() => setRightPinned((v) => !v)} />
          </div>

          {/* Right sidebar */}
          <FloatingSidebar side="right" pinned={rightPinned}>
            <DocumentPanel />
          </FloatingSidebar>
        </div>
      </div>
    </>
  );
}
