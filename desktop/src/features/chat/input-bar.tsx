import { useState, useRef, type KeyboardEvent } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import ProfileSelector from "./profile-selector";

const MAX_CHARS = 4000;

interface InputBarProps {
  onFolderToggle: () => void;
}

export default function InputBar({ onFolderToggle }: InputBarProps) {
  const { isStreaming, sendMessage, stopStreaming } = useChatStore();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = text.trim().length > 0 && !isStreaming;

  const handleSend = async () => {
    if (!canSend) return;
    const trimmed = text.trim();
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      await sendMessage(trimmed);
    } catch {
      // store 내부에서 toast로 에러 처리됨
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const charCount = text.length;
  const nearLimit = charCount > MAX_CHARS * 0.8;

  return (
    <div
      style={{
        padding: "12px 16px 16px",
        background: "var(--background)",
        borderTop: "1px solid var(--surface-2)",
      }}
    >
      {/* Main input container */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "10px 10px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Textarea row */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
          {/* Attach button */}
          <Tb icon={I.attach} tip="파일 첨부" disabled />

          {/* Folder toggle */}
          <Tb icon={I.folder} tip="문서 패널" onClick={onFolderToggle} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={isStreaming}
            placeholder={isStreaming ? "응답 생성 중..." : "메시지를 입력하세요..."}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--foreground)",
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: "inherit",
              minHeight: 24,
              maxHeight: 160,
              padding: "2px 0",
              opacity: isStreaming ? 0.5 : 1,
            }}
          />

          {/* Profile selector */}
          <div style={{ alignSelf: "flex-end" }}>
            <ProfileSelector />
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              title="중지"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--destructive)",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                color: "var(--destructive-foreground)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in oklch, var(--destructive) 85%, black)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--destructive)")}
            >
              {I.stop}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              title="전송 (Enter)"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: canSend ? "var(--primary)" : "var(--border)",
                border: "none",
                borderRadius: 8,
                cursor: canSend ? "pointer" : "not-allowed",
                color: canSend ? "var(--primary-foreground)" : "var(--text-dim)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (canSend) e.currentTarget.style.background = "color-mix(in oklch, var(--primary) 80%, black)";
              }}
              onMouseLeave={(e) => {
                if (canSend) e.currentTarget.style.background = "var(--primary)";
              }}
            >
              {I.send}
            </button>
          )}
        </div>

        {/* Footer row: char counter + hint */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingLeft: 2,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--input)" }}>
            Enter로 전송 · Shift+Enter로 줄바꿈
          </span>
          {charCount > 0 && (
            <span
              style={{
                fontSize: 11,
                color: nearLimit ? "var(--destructive)" : "var(--input)",
              }}
            >
              {charCount} / {MAX_CHARS}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
