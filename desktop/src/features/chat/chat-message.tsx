import { useState, useMemo, useEffect, useRef } from "react";
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

function scoreColor(score: number) {
  if (score >= 0.7) return "oklch(0.62 0.15 145)";
  if (score >= 0.4) return "oklch(0.70 0.13 60)";
  return "oklch(0.55 0.18 20)";
}

function scoreLabel(score: number) {
  if (score >= 0.7) return "높음";
  if (score >= 0.4) return "보통";
  return "낮음";
}

function SourceBadge({ source }: { source: Source }) {
  const [show, setShow] = useState(false);
  const label = source.filename.replace(/\.pdf$/i, "");
  const color = scoreColor(source.score);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "2px 8px",
          fontSize: 11,
          color: "var(--text-muted)",
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
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <p style={{ fontWeight: 600, color: "var(--foreground)", marginBottom: 4, fontSize: 12 }}>
            {source.filename}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>
            {source.text.slice(0, 200)}
            {source.text.length > 200 ? "…" : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              관련도 {scoreLabel(source.score)} · {(source.score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const MAX_VISIBLE_SOURCES = 4;

function SourceList({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  const visible = expanded ? sources : sources.slice(0, MAX_VISIBLE_SOURCES);
  const hidden = sources.length - MAX_VISIBLE_SOURCES;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10, alignItems: "center" }}>
      {visible.map((s) => (
        <SourceBadge key={s.chunk_id} source={s} />
      ))}
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            color: "var(--text-dim)",
            cursor: "pointer",
          }}
        >
          +{hidden}개 더
        </button>
      )}
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
        background: "color-mix(in oklch, var(--destructive) 8%, transparent)",
        border: "1px solid color-mix(in oklch, var(--destructive) 20%, transparent)",
        borderRadius: 10,
        color: "var(--destructive)",
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
  const [justCompleted, setJustCompleted] = useState(false);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && message.content && isLast && message.role === "assistant") {
      setJustCompleted(true);
      const t = setTimeout(() => setJustCompleted(false), 3000);
      return () => clearTimeout(t);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, message.content, isLast, message.role]);

  const parsedContent = useMemo(
    () => message.content ? parseMarkdown(message.content) : null,
    [message.content]
  );

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
                  background: "var(--surface-2)",
                  border: "1px solid var(--input)",
                  borderRadius: "12px 12px 4px 12px",
                  padding: "10px 14px",
                  color: "var(--foreground)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  resize: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-dim)", marginRight: "auto" }}>
                  Esc 취소 · Ctrl+Enter 전송
                </span>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 12,
                    color: "var(--text-muted)",
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
                    background: "var(--primary)",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12,
                    color: "var(--primary-foreground)",
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
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px 12px 4px 12px",
                  padding: "10px 14px",
                  color: "var(--foreground)",
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
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{formatTime(ts)}</span>
                  <Tb icon={copied ? I.check : I.copy} tip={copied ? "복사됨" : "복사"} onClick={handleCopy} act={copied} activeColor="var(--success)" />
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
        <div style={{ fontSize: 14, color: "var(--foreground)", lineHeight: 1.7 }}>
          {parsedContent}
          {isStreaming && (
            <span style={{ animation: "cb 1s step-end infinite", color: "var(--primary)", marginLeft: 1 }}>
              ▋
            </span>
          )}
        </div>
      )}

      {/* Completion signal */}
      {justCompleted && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--success)",
            marginTop: 5,
            animation: "ms 0.3s ease",
          }}
        >
          {I.check}
          <span>{formatTime(ts)} · 응답 완료</span>
        </div>
      )}

      {/* Sources */}
      {message.sources && message.sources.length > 0 && !isStreaming && (
        <SourceList sources={message.sources} />
      )}

      {/* Interrupted badge */}
      {message.interrupted && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{
            display: "inline-flex",
            background: "color-mix(in oklch, var(--destructive) 10%, transparent)",
            border: "1px solid color-mix(in oklch, var(--destructive) 22%, transparent)",
            color: "color-mix(in oklch, var(--destructive) 75%, var(--text-dim))",
            borderRadius: 4,
            padding: "1px 7px",
            fontSize: 10,
          }}>
            중단됨
          </span>
          {isLast && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
        </div>
      )}

      {/* Hover toolbar */}
      {!isStreaming && message.content && !message.interrupted && hovered && (
        <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            onClick={handleCopy}
            act={copied}
            activeColor="var(--success)"
          />
          {isLast && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
        </div>
      )}
      {!isStreaming && message.content && message.interrupted && hovered && (
        <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            onClick={handleCopy}
            act={copied}
            activeColor="var(--success)"
          />
        </div>
      )}
    </div>
  );
}
