import { useState, useMemo, useEffect, useRef } from "react";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { parseMarkdown } from "../../shared/ui/markdown";
import ThinkingIndicator from "./thinking-indicator";
import { useChatStore } from "../../store/chat";
import type { Message } from "../../store/chat";
import type { Source } from "../../lib/api";
import { cn } from "@/lib/utils";

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

const metaClass = "text-xs text-[var(--text-dim)] font-[tabular-nums] tracking-[0.025em]";

function SourceBadge({ source }: { source: Source }) {
  const [show, setShow] = useState(false);
  const label = source.filename.replace(/\.pdf$/i, "");
  const color = scoreColor(source.score);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="bg-transparent border border-border rounded-xs px-2 py-0.5 text-xs text-[var(--text-dim)] leading-[1.65] font-[inherit] tracking-[0.01em] cursor-default transition-[color,border-color] duration-150 hover:border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] hover:text-[var(--text-secondary)]"
      >
        {label}
      </button>
      {show && (
        <div className="absolute bottom-full left-0 mb-2 z-[100] w-[290px] px-3.5 py-3 bg-card border border-border rounded-sm shadow-[0_16px_40px_rgba(0,0,0,0.65)]">
          <p className="font-semibold text-foreground mb-1.5 text-xs tracking-[0.01em] leading-[1.4]">
            {source.filename}
          </p>
          <p className="text-[var(--text-muted)] text-xs leading-[1.6] m-0">
            {source.text.slice(0, 220)}
            {source.text.length > 220 ? "…" : ""}
          </p>
          <div className="flex items-center gap-[5px] mt-2 pt-[7px] border-t border-border">
            <span
              className="w-[5px] h-[5px] rounded-full shrink-0 inline-block"
              style={{ background: color }}
            />
            <span className="text-xs text-[var(--text-dim)] font-[tabular-nums] tracking-[0.02em]">
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
    <div className="flex flex-wrap items-center gap-[3px] mt-3.5">
      {visible.map((s) => (
        <SourceBadge key={s.chunk_id} source={s} />
      ))}
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="bg-transparent border border-border rounded-xs px-2 py-0.5 text-xs text-[var(--text-dim)] cursor-pointer font-[inherit] tracking-[0.01em] transition-[color,border-color] duration-[120ms] hover:border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] hover:text-[var(--text-secondary)]"
        >
          +{hidden}개 더
        </button>
      )}
    </div>
  );
}

export function ErrorMsg({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 px-3.5 py-2.5 bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_20%,transparent)] rounded-xs text-destructive text-sm leading-[1.5] my-1">
      {I.alert}
      <span>{message}</span>
    </div>
  );
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });

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
    <div className="mt-3.5">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="flex-1 h-px bg-border" />
        <span className={cn(metaClass, "shrink-0")}>
          {meta.nextOffset} / {meta.totalCount}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 bg-transparent border border-border rounded-xs text-xs font-[inherit] tracking-[0.01em] leading-[1.5] transition-[color,border-color] duration-[120ms]",
          loading
            ? "text-[var(--text-dim)] cursor-default"
            : "text-[var(--text-secondary)] cursor-pointer hover:border-[color-mix(in_oklch,var(--primary)_20%,var(--border))] hover:text-foreground"
        )}
      >
        {loading ? (
          <span className="opacity-[0.45] tracking-[0.15em]">···</span>
        ) : (
          <>
            <span className="text-primary font-[tabular-nums] text-xs opacity-[0.85]">
              {rangeStart}–{rangeEnd}번째
            </span>
            <span>이어서 작성하기</span>
            <span className={cn(metaClass, "text-xs")}>
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
        className="flex justify-end pt-3.5 pb-1 [animation:ms_0.22s_ease]"
      >
        <div className="max-w-[72%]">
          {editing ? (
            <div className="bg-card border border-[color-mix(in_oklch,var(--primary)_22%,var(--border))] rounded-xl overflow-hidden">
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
                className="block w-full bg-transparent border-none px-3.5 py-3 text-foreground text-sm leading-[1.55] resize-none box-border font-[inherit] outline-none"
              />
              <div className="flex justify-end items-center gap-1 px-2 pt-1.5 pb-2 border-t border-border">
                <span className={cn(metaClass, "mr-auto pl-1.5")}>
                  Esc 취소 · Ctrl+Enter 전송
                </span>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="bg-transparent border-none text-xs text-[var(--text-muted)] cursor-pointer px-2 py-1.5 font-[inherit]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmitEdit}
                  className="bg-primary border-none rounded-md px-3.5 py-1.5 text-xs text-primary-foreground cursor-pointer font-[inherit] tracking-[0.01em]"
                >
                  다시 질문
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-[color-mix(in_oklch,var(--primary)_8%,var(--background))] border border-[color-mix(in_oklch,var(--primary)_12%,var(--border))] rounded-xl px-3.5 py-[9px] text-foreground text-sm leading-[1.55] whitespace-pre-wrap break-words">
                {message.content}
              </div>
              <div
                className={cn(
                  "flex justify-end items-center gap-0.5 mt-[5px] transition-opacity duration-150",
                  hovered ? "opacity-100" : "opacity-0"
                )}
              >
                <span className={cn(metaClass, "mr-0.5")}>
                  {formatTime(ts)}
                </span>
                <Tb icon={copied ? I.check : I.copy} tip={copied ? "복사됨" : "복사"} onClick={handleCopy} act={copied} activeColor="var(--success)" />
                <Tb icon={I.edit} tip="편집" onClick={() => setEditing(true)} disabled={isStreaming} />
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
      className="flex flex-col pt-1.5 pb-6 [animation:ms_0.28s_ease]"
    >
      {isStreaming && !message.content && <ThinkingIndicator />}

      {message.content && (
        <div className="text-base text-foreground leading-[1.82]">
          {parsedContent}
          {isStreaming && (
            <span className="[animation:cb_1s_step-end_infinite] text-primary ml-[1px]">
              ▋
            </span>
          )}
        </div>
      )}

      {justCompleted && (
        <div className="flex items-center gap-[5px] text-success mt-[7px] text-xs font-[tabular-nums] tracking-[0.025em] [animation:ms_0.3s_ease]">
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
        <div className="flex items-center gap-1.5 mt-2">
          <span className="inline-flex bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_22%,transparent)] text-[color-mix(in_oklch,var(--destructive)_75%,var(--text-dim))] rounded-xs px-[7px] py-[1px] text-xs font-[tabular-nums] tracking-[0.025em]">
            중단됨
          </span>
          {isLast && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
        </div>
      )}

      {!isStreaming && message.content && (
        <div
          className={cn(
            "flex items-center gap-0.5 mt-2 transition-opacity duration-150",
            hovered ? "opacity-100" : "opacity-0"
          )}
        >
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            onClick={handleCopy}
            act={copied}
            activeColor="var(--success)"
          />
          {isLast && !message.interrupted && <Tb icon={I.refresh} tip="다시 생성" onClick={onRegenerate} />}
          <div className="w-px h-3.5 bg-border mx-1 shrink-0" />
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
