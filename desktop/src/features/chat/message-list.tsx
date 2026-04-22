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
    const currentProfile = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "24px",
          animation: "fi 0.4s ease",
        }}
      >
        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto" }}>
          {/* Profile context */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, marginBottom: 24 }}>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                marginBottom: 10,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {currentProfile.label}
            </p>
            <p style={{ fontSize: 16, color: "var(--foreground)", lineHeight: 1.65 }}>
              {currentProfile.subtitle}
            </p>
          </div>

          {/* Suggestion list */}
          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                marginBottom: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              시작 질문
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {currentProfile.suggestions.map((s, idx) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "7px 0",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    fontFamily: "inherit",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                >
                  <span style={{
                    color: "var(--text-dim)",
                    flexShrink: 0,
                    fontSize: 10,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.02em",
                    minWidth: 16,
                    marginTop: 3,
                  }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Document hint */}
          <button
            onClick={onRightPanelToggle}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 12,
              color: "var(--text-dim)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
          >
            {I.folder}
            <span>문서를 추가하면 해당 범위를 기반으로 답변합니다</span>
          </button>
        </div>
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
            gap: 0,
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
            borderRadius: 4,
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
