import { useEffect, useRef, useState, useCallback, type UIEvent } from "react";
import { useChatStore } from "../../store/chat";
import ChatMessage from "./chat-message";
import { I } from "../../shared/ui/icons";

const SUGGESTIONS = [
  "이 문서의 핵심 내용을 요약해주세요",
  "관련 법률 조항을 찾아주세요",
  "투자 리스크를 분석해주세요",
  "기술 스펙을 정리해주세요",
];

interface MessageListProps {
  onRightPanelToggle: () => void;
}

export default function MessageList({ onRightPanelToggle }: MessageListProps) {
  const { sessions, activeSessionId, isStreaming, sendMessage } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
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
    if (lastUserMsg) sendMessage(lastUserMsg.content);
  }, [activeSession, isStreaming, sendMessage]);

  const handleEdit = useCallback(
    (_content: string) => {
      // TODO: edit modal
    },
    []
  );

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
        {/* ✦ icon */}
        <div
          style={{
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            color: "#3f3f46",
            animation: "float 3s ease-in-out infinite",
          }}
        >
          ✦
        </div>
        <p style={{ color: "#52525b", fontSize: 14 }}>무엇이든 물어보세요</p>
        {/* Suggestion chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              style={{
                background: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 20,
                padding: "7px 14px",
                fontSize: 12,
                color: "#71717a",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#a1a1aa";
                e.currentTarget.style.borderColor = "#3f3f46";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#71717a";
                e.currentTarget.style.borderColor = "#27272a";
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
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12,
            color: "#52525b",
            cursor: "pointer",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#71717a")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
        >
          {I.folder}
          <span>문서를 업로드하면 정확도가 높아집니다</span>
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
            onEdit={handleEdit}
          />
        ))}
        <div ref={bottomRef} />
      </div>

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
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 20,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "#71717a",
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
