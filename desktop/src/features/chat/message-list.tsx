import { useEffect, useRef, useState, useCallback, type UIEvent } from "react";
import { useChatStore } from "../../store/chat";
import ChatMessage from "./chat-message";
import { I } from "../../shared/ui/icons";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import { PROFILES } from "../../shared/profiles";

interface MessageListProps {
  onRightPanelToggle: () => void;
}

export default function MessageList({ onRightPanelToggle }: MessageListProps) {
  const { sessions, activeSessionId, isStreaming, sendMessage, editAndResend, profile } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const pendingRegenerateRef = useRef<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{ id: string; content: string; subsequentCount: number } | null>(null);
  // 사용자가 위로 스크롤했는지 추적 — true면 자동 스크롤 억제
  const userScrolledRef = useRef(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll: 사용자가 스크롤하지 않은 경우에만 실행
  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom();
    }
  }, [messages.length, messages[messages.length - 1]?.content, scrollToBottom]);

  // 스크롤 위치 감지
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distFromBottom <= 120;
    setShowScrollBtn(!isNearBottom);
    userScrolledRef.current = !isNearBottom;
  }, []);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerate = useCallback(() => {
    if (!activeSession || isStreaming) return;
    const userMessages = activeSession.messages.filter((m) => m.role === "user");
    const lastUserMsg = userMessages[userMessages.length - 1];
    if (!lastUserMsg) return;
    pendingRegenerateRef.current = lastUserMsg.content;
    setShowRegenerateConfirm(true);
  }, [activeSession, isStreaming]);

  const handleRegenerateConfirmed = useCallback(() => {
    if (pendingRegenerateRef.current) sendMessage(pendingRegenerateRef.current);
    pendingRegenerateRef.current = null;
  }, [sendMessage]);

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: 24,
          animation: "fi 0.4s ease",
        }}
      >
        {/* star icon */}
        <div
          style={{
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary)",
            opacity: 0.6,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z" />
          </svg>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
          {(PROFILES.find((p) => p.value === profile) ?? PROFILES[0]).subtitle}
        </p>
        {/* Suggestion chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480 }}>
          {(PROFILES.find((p) => p.value === profile) ?? PROFILES[0]).suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "7px 14px",
                fontSize: 12,
                color: "var(--text-muted)",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--input)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              {s}
            </button>
          ))}
        </div>
        {/* Folder hint */}
        <button
          onClick={onRightPanelToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            color: "var(--text-dim)",
            cursor: "pointer",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
        >
          {I.folder}
          <span>문서를 업로드하고 폴더를 활성화하면 해당 범위만 검색합니다</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: "20px 24px",
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={!!(msg.streaming && isStreaming)}
              isLast={idx === messages.length - 1}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onEdit={(newContent) => {
                const msgIdx = messages.findIndex((m) => m.id === msg.id);
                const subsequentCount = messages.length - msgIdx - 1;
                if (subsequentCount > 0) {
                  setPendingEdit({ id: msg.id, content: newContent, subsequentCount });
                } else {
                  editAndResend(msg.id, newContent);
                }
              }}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <AlertDialog
        open={showRegenerateConfirm}
        onOpenChange={(open) => { if (!open) setShowRegenerateConfirm(false); }}
        title="응답 재생성"
        description="이전 응답이 삭제되고 다시 생성됩니다. 계속하시겠습니까?"
        actionLabel="재생성"
        onAction={handleRegenerateConfirmed}
      />
      <AlertDialog
        open={pendingEdit !== null}
        onOpenChange={(open) => { if (!open) setPendingEdit(null); }}
        title="이후 대화 삭제"
        description={`편집하면 이후 ${pendingEdit?.subsequentCount}개 메시지가 삭제됩니다. 계속하시겠습니까?`}
        actionLabel="편집 후 재전송"
        onAction={() => {
          if (pendingEdit) editAndResend(pendingEdit.id, pendingEdit.content);
          setPendingEdit(null);
        }}
      />

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => {
            userScrolledRef.current = false;
            scrollToBottom();
          }}
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--text-muted)",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            zIndex: 10,
          }}
        >
          {I.chevDown}
          <span>아래로</span>
        </button>
      )}
    </div>
  );
}
