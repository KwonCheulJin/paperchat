import { useState, useMemo, useEffect, useRef } from "react";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { parseMarkdown } from "../../shared/ui/markdown";
import ThinkingIndicator from "./thinking-indicator";
import { useChatStore } from "../../store/chat";
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
  const [hovered, setHovered] = useState(false);
  const label = source.filename.replace(/\.pdf$/i, "");
  const color = scoreColor(source.score);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onMouseEnter={() => { setShow(true); setHovered(true); }}
        onMouseLeave={() => { setShow(false); setHovered(false); }}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        style={{
          background: "transparent",
          border: `1px solid ${hovered
            ? "color-mix(in oklch, var(--primary) 28%, var(--border))"
            : "var(--border)"}`,
          borderRadius: 2,
          padding: "2px 8px",
          fontSize: 11,
          color: hovered ? "var(--text-secondary)" : "var(--text-dim)",
          cursor: "default",
          lineHeight: 1.65,
          fontFamily: "inherit",
          transition: "color 0.15s, border-color 0.15s",
          letterSpacing: "0.01em",
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
            marginBottom: 8,
            zIndex: 100,
            width: 290,
            padding: "12px 14px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            boxShadow: "0 16px 40px rgba(0,0,0,0.65)",
          }}
        >
          <p style={{
            fontWeight: 600,
            color: "var(--foreground)",
            marginBottom: 6,
            fontSize: 12,
            letterSpacing: "0.01em",
            lineHeight: 1.4,
          }}>
            {source.filename}
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.6, margin: 0 }}>
            {source.text.slice(0, 220)}
            {source.text.length > 220 ? "…" : ""}
          </p>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginTop: 8,
            paddingTop: 7,
            borderTop: "1px solid var(--border)",
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
              display: "inline-block",
            }} />
            <span style={{
              fontSize: 10,
              color: "var(--text-dim)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.02em",
            }}>
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 14, alignItems: "center" }}>
      {visible.map((s) => (
        <SourceBadge key={s.chunk_id} source={s} />
      ))}
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 2,
            padding: "2px 8px",
            fontSize: 11,
            color: "var(--text-dim)",
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.01em",
            transition: "color 0.12s, border-color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "color-mix(in oklch, var(--primary) 28%, var(--border))";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-dim)";
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
        borderRadius: 2,
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

const metaStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--text-dim)",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.025em",
};

function ContinueButton({ messageId, meta }: { messageId: string; meta: NonNullable<Message["entityMeta"]> }) {
  const [loading, setLoading] = useState(false);
  const fetchMoreEntities = useChatStore((s) => s.fetchMoreEntities);

  const rangeStart = meta.nextOffset + 1;
  const rangeEnd = Math.min(meta.nextOffset + 50, meta.totalCount);
  const remaining = meta.totalCount - meta.nextOffset;

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetchMoreEntities(messageId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
        <span style={{ ...metaStyle, flexShrink: 0 }}>
          {meta.nextOffset} / {meta.totalCount}
        </span>
        <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 2,
          fontSize: 12,
          color: loading ? "var(--text-dim)" : "var(--text-secondary)",
          cursor: loading ? "default" : "pointer",
          letterSpacing: "0.01em",
          fontFamily: "inherit",
          lineHeight: 1.5,
          transition: "color 0.12s, border-color 0.12s",
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "color-mix(in oklch, var(--primary) 20%, var(--border))";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)";
          }
        }}
        onMouseLeave={(e) => {
          if (!loading) {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
          }
        }}
      >
        {loading ? (
          <span style={{ opacity: 0.45, letterSpacing: "0.15em" }}>···</span>
        ) : (
          <>
            <span style={{ color: "var(--primary)", fontVariantNumeric: "tabular-nums", fontSize: 11, opacity: 0.85 }}>
              {rangeStart}–{rangeEnd}번째
            </span>
            <span>이어서 작성하기</span>
            <span style={{ ...metaStyle, fontSize: 11 }}>
              · 나머지 {remaining}개
            </span>
          </>
        )}
      </button>
    </div>
  );
}

export default function ChatMessage({
  message,
  isStreaming,
  isLast,
  onCopy,
  onRegenerate,
  onEdit,
}: ChatMessageProps) {
  const setFeedback = useChatStore((s) => s.setFeedback);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [justCompleted, setJustCompleted] = useState(false);
  const [hovered, setHovered] = useState(false);
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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "14px 0 4px",
          animation: "ms 0.22s ease",
        }}
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
                  background: "color-mix(in oklch, var(--primary) 5%, var(--background))",
                  border: "1px solid color-mix(in oklch, var(--primary) 22%, var(--border))",
                  borderRadius: 2,
                  padding: "9px 14px",
                  color: "var(--foreground)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  resize: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 6 }}>
                <span style={{ ...metaStyle, marginRight: "auto" }}>
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
                    fontFamily: "inherit",
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
                    borderRadius: 2,
                    padding: "6px 14px",
                    fontSize: 12,
                    color: "var(--primary-foreground)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.01em",
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
                  background: "color-mix(in oklch, var(--primary) 8%, var(--background))",
                  border: "1px solid color-mix(in oklch, var(--primary) 12%, var(--border))",
                  borderRadius: 2,
                  padding: "9px 14px",
                  color: "var(--foreground)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {message.content}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 2,
                  marginTop: 5,
                }}
              >
                <span style={{ ...metaStyle, marginRight: 2 }}>
                  {formatTime(ts)}
                </span>
                <div style={{ display: "flex", opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
                  <Tb icon={copied ? I.check : I.copy} tip={copied ? "복사됨" : "복사"} onClick={handleCopy} act={copied} activeColor="var(--success)" />
                  <Tb icon={I.edit} tip="편집" onClick={() => setEditing(true)} disabled={isStreaming} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "6px 0 24px",
        animation: "ms 0.28s ease",
      }}
    >
      {isStreaming && !message.content && <ThinkingIndicator />}

      {message.content && (
        <div style={{ fontSize: 15, color: "var(--foreground)", lineHeight: 1.82 }}>
          {parsedContent}
          {isStreaming && (
            <span style={{ animation: "cb 1s step-end infinite", color: "var(--primary)", marginLeft: 1 }}>
              ▋
            </span>
          )}
        </div>
      )}

      {justCompleted && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            ...metaStyle,
            color: "var(--success)",
            marginTop: 7,
            animation: "ms 0.3s ease",
          }}
        >
          {I.check}
          <span>{formatTime(ts)} · 응답 완료</span>
        </div>
      )}

      {message.sources && message.sources.length > 0 && !isStreaming && (
        <SourceList sources={message.sources} />
      )}

      {!isStreaming && message.entityMeta?.hasMore && (
        <ContinueButton messageId={message.id} meta={message.entityMeta} />
      )}

      {message.interrupted && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span style={{
            display: "inline-flex",
            background: "color-mix(in oklch, var(--destructive) 10%, transparent)",
            border: "1px solid color-mix(in oklch, var(--destructive) 22%, transparent)",
            color: "color-mix(in oklch, var(--destructive) 75%, var(--text-dim))",
            borderRadius: 2,
            padding: "1px 7px",
            ...metaStyle,
            fontSize: 10,
          }}>
            중단됨
          </span>
          {isLast && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
        </div>
      )}

      {!isStreaming && message.content && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            marginTop: 8,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            onClick={handleCopy}
            act={copied}
            activeColor="var(--success)"
          />
          {isLast && !message.interrupted && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px", flexShrink: 0 }} />
          <Tb
            icon={I.thumbUp}
            tip="도움이 됐어요"
            onClick={() => setFeedback(message.id, "up")}
            act={message.feedback === "up"}
            activeColor="var(--success)"
          />
          <Tb
            icon={I.thumbDown}
            tip="도움이 안 됐어요"
            onClick={() => setFeedback(message.id, "down")}
            act={message.feedback === "down"}
            activeColor="var(--destructive)"
          />
        </div>
      )}
    </div>
  );
}
