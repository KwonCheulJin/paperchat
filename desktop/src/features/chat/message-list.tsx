import { useEffect, useRef, useState, useCallback, type UIEvent } from "react";
import { useChatStore } from "../../store/chat";
import ChatMessage from "./chat-message";
import { I } from "../../shared/ui/icons";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import { PROFILES } from "../../shared/profiles";
import { cn } from "@/lib/utils";

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
  const userScrolledRef = useRef(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (!userScrolledRef.current) {
      scrollToBottom();
    }
  }, [messages.length, messages[messages.length - 1]?.content, scrollToBottom]);

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
        className="flex-1 flex flex-col justify-center p-6"
        style={{ animation: "fi 0.4s ease" }}
      >
        <div className="max-w-[560px] w-full mx-auto">
          {/* Profile context */}
          <div className="pt-5 mb-6">
            <p className="text-[11px] text-[var(--text-dim)] mb-[10px] tracking-[0.05em] uppercase">
              {currentProfile.label}
            </p>
            <p className="text-[16px] text-foreground leading-[1.65]">
              {currentProfile.subtitle}
            </p>
          </div>

          {/* Suggestion list */}
          <div className="mb-7">
            <p className="text-[11px] text-[var(--text-dim)] mb-[10px] tracking-[0.06em] uppercase">
              시작 질문
            </p>
            <div className="flex flex-col gap-0">
              {currentProfile.suggestions.map((s, idx) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="bg-transparent border-none py-[7px] text-[13px] text-[var(--text-secondary)] cursor-pointer text-left flex items-start gap-3 font-[inherit] transition-colors duration-[120ms] hover:text-foreground"
                >
                  <span className="text-[var(--text-dim)] shrink-0 text-[10px] tabular-nums tracking-[0.02em] min-w-[16px] mt-[3px]">
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
            className="bg-transparent border-none p-0 text-[12px] text-[var(--text-dim)] cursor-pointer flex items-center gap-[6px] font-[inherit] transition-colors duration-[120ms] hover:text-[var(--text-muted)]"
          >
            {I.folder}
            <span>문서를 추가하면 해당 범위를 기반으로 답변합니다</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-6 py-5"
      >
        <div className="max-w-[760px] mx-auto flex flex-col gap-0">
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
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2",
            "bg-card border border-border rounded-[4px] px-[14px] py-[5px]",
            "flex items-center gap-[5px] text-[12px] text-[var(--text-muted)]",
            "cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.4)] z-10",
          )}
        >
          {I.chevDown}
          <span>아래로</span>
        </button>
      )}
    </div>
  );
}
