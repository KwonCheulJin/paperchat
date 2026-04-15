import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useDocumentsStore } from "../../store/documents";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import type { DocumentInfo } from "../../lib/api";

type Props = {
  onClose: () => void;
};

const OTHER_KEY = "";
const OTHER_LABEL = "(기타)";

export default function DocumentPanel({ onClose }: Props) {
  const {
    documents,
    uploadProgress,
    isUploading,
    loadDocuments,
    uploadFile,
    uploadFiles,
    deleteDocument,
  } = useDocumentsStore();
  const activeFolder = useChatStore((s) => s.activeFolder);
  const setActiveFolder = useChatStore((s) => s.setActiveFolder);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // 폴더 input에 webkitdirectory 속성 부여 (TS가 JSX 속성으로 직접 인식 못함)
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
    }
  }, []);

  const handleSingleFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("PDF 파일만 업로드 가능합니다.");
      return;
    }
    uploadFile(file);
  };

  const handleFolderSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast.error("선택한 폴더에 PDF 파일이 없습니다.");
      return;
    }
    const firstPath = pdfs[0].webkitRelativePath || "";
    const folderName = firstPath.split(/[/\\]/)[0] ?? "";
    if (!folderName) {
      toast.error("폴더명을 추출할 수 없습니다.");
      return;
    }
    uploadFiles(pdfs, folderName);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleSingleFile(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  // 폴더별 그룹핑 + 정렬된 키 (이름 있는 폴더 알파벳순, "(기타)"는 마지막)
  const { groups, orderedKeys } = useMemo(() => {
    const g = documents.reduce<Record<string, DocumentInfo[]>>((acc, d) => {
      const key = d.folder || OTHER_KEY;
      (acc[key] ??= []).push(d);
      return acc;
    }, {});
    const named = Object.keys(g)
      .filter((k) => k !== OTHER_KEY)
      .sort((a, b) => a.localeCompare(b, "ko"));
    const keys = OTHER_KEY in g ? [...named, OTHER_KEY] : named;
    return { groups: g, orderedKeys: keys };
  }, [documents]);

  const isFolderExpanded = (key: string) => folderExpanded[key] ?? true;

  const toggleFolderExpanded = (key: string) => {
    setFolderExpanded((prev) => ({ ...prev, [key]: !isFolderExpanded(key) }));
  };

  const onActivateToggle = (folderName: string) => {
    // "(기타)" 그룹은 활성화 대상이 아님 — 빈 folder는 전체 검색에 포함
    if (folderName === OTHER_KEY) return;
    setActiveFolder(activeFolder === folderName ? null : folderName);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0c0d10",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 10px",
          flexShrink: 0,
          borderBottom: "1px solid #1f1f23",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {I.folder}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8" }}>문서 관리</span>
        </div>
        <Tb icon={I.x} tip="닫기" onClick={onClose} />
      </div>

      {/* Upload area */}
      <div style={{ padding: "10px 10px 8px", flexShrink: 0 }}>
        {isUploading ? (
          <div
            style={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {I.upload}
              <span style={{ fontSize: 12, color: "#a1a1aa" }}>업로드 중...</span>
            </div>
            <div
              style={{
                height: 3,
                background: "#27272a",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "30%",
                  background: "#a78bfa",
                  borderRadius: 2,
                  animation: "indeterminate 1.2s ease-in-out infinite",
                }}
              />
            </div>
            {uploadProgress && (
              <p style={{ fontSize: 11, color: "#71717a", marginTop: 5 }}>{uploadProgress}</p>
            )}
          </div>
        ) : (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? "#a78bfa" : "#27272a"}`,
                borderRadius: 10,
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                background: dragOver ? "rgba(167,139,250,0.04)" : "transparent",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!dragOver) {
                  e.currentTarget.style.borderColor = "#3f3f46";
                  e.currentTarget.style.background = "rgba(255,255,255,0.01)";
                }
              }}
              onMouseLeave={(e) => {
                if (!dragOver) {
                  e.currentTarget.style.borderColor = "#27272a";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <div style={{ color: "#52525b" }}>{I.upload}</div>
              <p style={{ fontSize: 11, color: "#52525b", textAlign: "center", lineHeight: 1.4 }}>
                PDF 드래그 또는 클릭하여 업로드
              </p>
            </div>
            <button
              onClick={() => folderInputRef.current?.click()}
              style={{
                marginTop: 6,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: "transparent",
                border: "1px solid #27272a",
                borderRadius: 8,
                padding: "8px 10px",
                color: "#a1a1aa",
                fontSize: 11,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#a78bfa";
                e.currentTarget.style.background = "rgba(167,139,250,0.04)";
                e.currentTarget.style.color = "#d4d4d8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#27272a";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#a1a1aa";
              }}
            >
              <span style={{ display: "flex" }}>{I.folder}</span>
              <span>폴더 선택</span>
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            handleSingleFile(e.target.files);
            // 같은 파일 재선택 가능하도록 리셋
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            handleFolderSelect(e.target.files);
            // 같은 폴더 재선택 가능하도록 리셋
            e.target.value = "";
          }}
        />
      </div>

      <div style={{ height: 1, background: "#1f1f23", flexShrink: 0, margin: "0 10px" }} />

      {/* Documents folder tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "4px 2px",
            cursor: "pointer",
            marginBottom: 4,
          }}
        >
          <span style={{ color: "#3f3f46", display: "flex" }}>
            {expanded ? I.chevDown : I.chevRight}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#3f3f46",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            인덱싱된 문서 ({documents.length})
          </span>
        </button>

        {expanded && (
          <>
            {documents.length === 0 ? (
              <p style={{ fontSize: 11, color: "#3f3f46", textAlign: "center", padding: "12px 0" }}>
                문서가 없습니다
              </p>
            ) : (
              orderedKeys.map((key) => {
                const docs = groups[key];
                const label = key === OTHER_KEY ? OTHER_LABEL : key;
                const open = isFolderExpanded(key);
                const isActive = activeFolder !== null && activeFolder === key;
                const canActivate = key !== OTHER_KEY;
                return (
                  <div key={key || "__other__"} style={{ marginBottom: 4 }}>
                    {/* Folder header */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 6px",
                        borderRadius: 7,
                        border: isActive ? "1px solid #a78bfa" : "1px solid transparent",
                        background: isActive ? "rgba(167,139,250,0.08)" : "transparent",
                        transition: "background 0.1s, border-color 0.1s",
                      }}
                    >
                      <button
                        onClick={() => toggleFolderExpanded(key)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          minWidth: 0,
                          textAlign: "left",
                        }}
                      >
                        <span style={{ color: "#52525b", display: "flex" }}>
                          {open ? I.chevDown : I.chevRight}
                        </span>
                        <span style={{ color: "#71717a", display: "flex" }}>{I.folder}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: isActive ? "#d4d4d8" : "#a1a1aa",
                            fontWeight: isActive ? 600 : 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}
                          title={label}
                        >
                          {label}
                        </span>
                        <span style={{ fontSize: 10, color: "#52525b", flexShrink: 0 }}>
                          {docs.length}
                        </span>
                      </button>
                      {canActivate && (
                        <button
                          onClick={() => onActivateToggle(key)}
                          title={isActive ? "활성 폴더 해제" : "활성 폴더로 지정 (채팅 스코프 제한)"}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            background: isActive ? "#a78bfa" : "transparent",
                            border: `1px solid ${isActive ? "#a78bfa" : "#3f3f46"}`,
                            color: isActive ? "#0c0d10" : "#52525b",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "background 0.1s, border-color 0.1s, color 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = "#a78bfa";
                              e.currentTarget.style.color = "#a78bfa";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = "#3f3f46";
                              e.currentTarget.style.color = "#52525b";
                            }
                          }}
                        >
                          {I.check}
                        </button>
                      )}
                    </div>

                    {/* Folder children */}
                    {open &&
                      docs.map((doc) => (
                        <div
                          key={doc.doc_id}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 7,
                            padding: "6px 6px 6px 22px",
                            borderRadius: 7,
                            marginBottom: 1,
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#18181b")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ color: "#52525b", marginTop: 1, flexShrink: 0 }}>
                            {I.file}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 12,
                                color: "#a1a1aa",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginBottom: 1,
                              }}
                              title={doc.filename}
                            >
                              {doc.filename}
                            </p>
                            <p style={{ fontSize: 10, color: "#3f3f46" }}>
                              {doc.chunk_count}청크 · {formatDate(doc.ingested_at)}
                            </p>
                          </div>
                          <Tb
                            icon={I.trash}
                            tip="삭제"
                            onClick={() => deleteDocument(doc.doc_id)}
                          />
                        </div>
                      ))}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <div style={{ height: 1, background: "#1f1f23", flexShrink: 0, margin: "0 10px" }} />

      {/* Context section */}
      <div style={{ padding: "10px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ color: "#3f3f46" }}>{I.globe}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#3f3f46",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            컨텍스트
          </span>
        </div>
        <p style={{ fontSize: 11, color: "#3f3f46", lineHeight: 1.5 }}>
          {activeFolder
            ? `'${activeFolder}' 폴더 문서만 검색에 사용됩니다.`
            : "업로드된 문서가 RAG 검색에 자동으로 사용됩니다."}
        </p>
      </div>
    </div>
  );
}
