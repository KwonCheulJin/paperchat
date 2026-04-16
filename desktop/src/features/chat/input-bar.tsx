import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useChatStore } from "../../store/chat";
import { useDocumentsStore } from "../../store/documents";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import ProfileSelector from "./profile-selector";

const MAX_CHARS = 4000;

interface InputBarProps {
  onFolderToggle: () => void;
}

export default function InputBar({ onFolderToggle }: InputBarProps) {
  const { isStreaming, sendMessage, stopStreaming } = useChatStore();
  const { uploadFile, uploadFiles } = useDocumentsStore();
  const [text, setText] = useState("");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 팝업 닫기
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
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
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
        style={{ display: "none" }}
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
          {/* Upload button + popup */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <Tb
              icon={I.attach}
              tip="파일 업로드"
              onClick={() => setShowUploadMenu((v) => !v)}
              act={showUploadMenu}
              activeColor="#a78bfa"
            />
            {showUploadMenu && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 4px)",
                  left: 0,
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  padding: "4px",
                  zIndex: 50,
                  minWidth: 160,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    color: "#a1a1aa",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#27272a";
                    e.currentTarget.style.color = "#d4d4d8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#a1a1aa";
                  }}
                >
                  {I.attach}
                  <span>PDF 파일 추가</span>
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 13,
                    color: "#a1a1aa",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#27272a";
                    e.currentTarget.style.color = "#d4d4d8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#a1a1aa";
                  }}
                >
                  {I.folder}
                  <span>폴더 추가</span>
                </button>
              </div>
            )}
          </div>

          {/* Folder toggle (오른쪽 패널) */}
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
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Enter로 전송 · Shift+Enter로 줄바꿈
          </span>
          {charCount > 0 && (
            <span
              style={{
                fontSize: 11,
                color: nearLimit ? "var(--destructive)" : "var(--text-dim)",
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
