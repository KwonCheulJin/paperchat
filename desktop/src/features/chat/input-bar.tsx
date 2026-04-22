import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useChatStore } from "../../store/chat";
import { useDocumentsStore } from "../../store/documents";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import ProfileSelector from "./profile-selector";
import { cn } from "@/lib/utils";

const MAX_CHARS = 4000;

interface InputBarProps {
  onFolderToggle: () => void;
}

export default function InputBar({ onFolderToggle }: InputBarProps) {
  const { isStreaming, streamingPhase, sendMessage, stopStreaming } = useChatStore();
  const { uploadFile, uploadFiles } = useDocumentsStore();
  const [text, setText] = useState(() => localStorage.getItem("chat_draft") ?? "");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUploadMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showUploadMenu]);

  const canSend = text.trim().length > 0 && !isStreaming && text.length <= MAX_CHARS;

  const updateText = useCallback((value: string) => {
    setText(value);
    if (value) {
      localStorage.setItem("chat_draft", value);
    } else {
      localStorage.removeItem("chat_draft");
    }
  }, []);

  const handleSend = async () => {
    if (!canSend) return;
    const trimmed = text.trim();
    updateText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    try {
      await sendMessage(trimmed);
    } catch {
      updateText(trimmed);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }
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
    <div className="px-6 pt-3 pb-4 bg-background">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = "";
          setShowUploadMenu(false);
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept=".pdf"
        {...{ webkitdirectory: "" }}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) =>
            f.name.endsWith(".pdf")
          );
          if (files.length > 0) {
            const folderName = (files[0] as File & { webkitRelativePath: string })
              .webkitRelativePath.split("/")[0];
            uploadFiles(files, folderName);
          }
          e.target.value = "";
          setShowUploadMenu(false);
        }}
      />

      {/* Main input container */}
      <div
        className="max-w-[760px] mx-auto bg-card rounded-[4px] p-[10px_10px_8px] flex flex-col gap-2"
        style={{ border: "1px solid color-mix(in oklch, var(--primary) 10%, var(--border))" }}
      >
        {/* Textarea row */}
        <div className="flex items-center gap-[6px]">
          {/* Upload button + popup */}
          <div ref={menuRef} className="relative">
            <Tb
              icon={I.attach}
              tip="파일 업로드"
              onClick={() => setShowUploadMenu((v) => !v)}
              act={showUploadMenu}
              activeColor="var(--primary)"
            />
            {showUploadMenu && (
              <div className="absolute bottom-[calc(100%+4px)] left-0 bg-card border border-border rounded-[4px] p-[3px] z-50 min-w-[160px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 w-full bg-transparent border-none rounded-[2px] px-[10px] py-[7px] text-[13px] text-[var(--text-muted)] cursor-pointer text-left font-[inherit] transition-[background,color] duration-100 hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
                >
                  {I.attach}
                  <span>PDF 파일 추가</span>
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="flex items-center gap-2 w-full bg-transparent border-none rounded-[2px] px-[10px] py-[7px] text-[13px] text-[var(--text-muted)] cursor-pointer text-left font-[inherit] transition-[background,color] duration-100 hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
                >
                  {I.folder}
                  <span>폴더 추가</span>
                </button>
              </div>
            )}
          </div>

          {/* Folder toggle */}
          <Tb icon={I.sidebarR} tip="문서 패널" onClick={onFolderToggle} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => updateText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={isStreaming}
            placeholder={
              streamingPhase === "fetching"
                ? "문서 검색 중..."
                : streamingPhase === "generating"
                ? "응답 작성 중..."
                : "메시지를 입력하세요..."
            }
            rows={1}
            className={cn(
              "flex-1 bg-transparent border-none outline-none resize-none text-foreground",
              "text-[14px] leading-[1.5] font-[inherit] min-h-[24px] max-h-[160px] py-[2px]",
              isStreaming && "opacity-50",
            )}
          />

          {/* Profile selector */}
          <ProfileSelector />

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              title="중지"
              aria-label="응답 중지"
              className="shrink-0 w-8 h-8 flex items-center justify-center bg-destructive border-none rounded-[2px] cursor-pointer text-destructive-foreground transition-colors duration-150 hover:opacity-90"
            >
              {I.stop}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              title="전송 (Enter)"
              aria-label="메시지 전송"
              className={cn(
                "shrink-0 w-8 h-8 flex items-center justify-center border-none rounded-[2px] transition-colors duration-150",
                canSend
                  ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
                  : "bg-border text-[var(--text-dim)] cursor-not-allowed",
              )}
            >
              {I.send}
            </button>
          )}
        </div>

        {/* Footer row */}
        <div className="flex justify-between items-center pl-[2px]">
          <span className="text-[11px] text-[var(--text-muted)]">
            Enter로 전송 · Shift+Enter로 줄바꿈 · ⌘⇧D 문서 패널
          </span>
          <span
            className={cn(
              "text-[11px] font-[tabular-nums] tracking-[0.01em]",
              nearLimit ? "text-destructive" : "text-[var(--text-dim)]",
              charCount === 0 && "opacity-40",
            )}
          >
            {charCount === 0 ? `최대 ${MAX_CHARS.toLocaleString()}자` : `${charCount} / ${MAX_CHARS}`}
          </span>
        </div>
      </div>
    </div>
  );
}
