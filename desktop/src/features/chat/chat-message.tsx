import { useState } from "react";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { parseMarkdown } from "../../shared/ui/markdown";
import ThinkingIndicator from "./thinking-indicator";
import type { Message } from "../../store/chat";
import type { Source } from "../../lib/api";

interface ChatMessageProps {
  message: Message;
  isStreaming: boolean;
  isLast: boolean;
  onCopy: (content: string) => void;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
}

function SourceBadge({ source }: { source: Source }) {
  const [show, setShow] = useState(false);
  const label = source.filename.replace(/\.pdf$/i, "");
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          background: "#1f1f23",
          border: "1px solid #27272a",
          borderRadius: 4,
          padding: "2px 8px",
          fontSize: 11,
          color: "#71717a",
          cursor: "default",
          lineHeight: 1.5,
        }}
      >
        {label}
      </button>
      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 6,
            zIndex: 100,
            width: 280,
            padding: 12,
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <p style={{ fontWeight: 600, color: "#d4d4d8", marginBottom: 4, fontSize: 12 }}>
            {source.filename}
          </p>
          <p style={{ color: "#71717a", fontSize: 11, lineHeight: 1.5 }}>
            {source.text.slice(0, 200)}
            {source.text.length > 200 ? "…" : ""}
          </p>
          <p style={{ color: "#52525b", fontSize: 11, marginTop: 4 }}>
            유사도: {(source.score * 100).toFixed(1)}%
          </p>
        </div>
      )}
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
      {sources.map((s) => (
        <SourceBadge key={s.chunk_id} source={s} />
      ))}
    </div>
  );
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 14px",
        background: "rgba(248,113,113,0.08)",
        border: "1px solid rgba(248,113,113,0.2)",
        borderRadius: 10,
        color: "#f87171",
        fontSize: 13,
        lineHeight: 1.5,
        margin: "4px 0",
      }}
    >
      {I.alert}
      <span>{message}</span>
    </div>
  );
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });

export default function ChatMessage({
  message,
  isStreaming,
  isLast,
  onCopy,
  onRegenerate,
  onEdit,
}: ChatMessageProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitEdit = () => {
    if (!editedContent.trim()) return;
    setEditing(false);
    onEdit(editedContent);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditedContent(message.content);
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    e.currentTarget.style.height = "auto";
    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSubmitEdit();
    }
  };

  const ts = message.createdAt ?? parseInt(message.id);

  if (message.role === "user") {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "3px 0",
          animation: "ms 0.25s ease",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ maxWidth: "72%" }}>
          {editing ? (
            <>
              <textarea
                aria-label="질문 편집"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                onInput={handleTextareaInput}
                onKeyDown={handleTextareaKeyDown}
                autoFocus
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                  }
                }}
                style={{
                  width: "100%",
                  background: "#1f1f23",
                  border: "1px solid #3f3f46",
                  borderRadius: "12px 12px 4px 12px",
                  padding: "10px 14px",
                  color: "#d4d4d8",
                  fontSize: 14,
                  lineHeight: 1.6,
                  resize: "none",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 12,
                    color: "#71717a",
                    cursor: "pointer",
                    padding: "6px 8px",
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmitEdit}
                  style={{
                    background: "#a78bfa",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  다시 질문
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  background: "#1f1f23",
                  border: "1px solid #27272a",
                  borderRadius: "12px 12px 4px 12px",
                  padding: "10px 14px",
                  color: "#d4d4d8",
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {message.content}
              </div>
              {hovered && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "#52525b" }}>{formatTime(ts)}</span>
                  <Tb icon={copied ? I.check : I.copy} tip={copied ? "복사됨" : "복사"} onClick={handleCopy} act={copied} activeColor="#4ade80" />
                  <Tb icon={I.edit} tip="편집" onClick={() => setEditing(true)} disabled={isStreaming} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      style={{ display: "flex", flexDirection: "column", padding: "3px 0", animation: "ms 0.25s ease" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thinking indicator — streaming with no content yet */}
      {isStreaming && !message.content && <ThinkingIndicator />}

      {/* Content */}
      {message.content && (
        <div style={{ fontSize: 14, color: "#d4d4d8", lineHeight: 1.7 }}>
          {parseMarkdown(message.content)}
          {isStreaming && (
            <span style={{ animation: "cb 1s step-end infinite", color: "#a78bfa", marginLeft: 1 }}>
              ▋
            </span>
          )}
        </div>
      )}

      {/* Sources */}
      {message.sources && message.sources.length > 0 && !isStreaming && (
        <SourceList sources={message.sources} />
      )}

      {/* Hover toolbar */}
      {!isStreaming && message.content && hovered && (
        <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            onClick={handleCopy}
            act={copied}
            activeColor="#4ade80"
          />
          <Tb icon={I.thumbUp} tip="좋아요 (준비 중)" disabled />
          <Tb icon={I.thumbDown} tip="싫어요 (준비 중)" disabled />
          {isLast && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
        </div>
      )}
    </div>
  );
}
