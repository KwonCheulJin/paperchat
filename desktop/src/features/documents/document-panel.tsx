import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useDocumentsStore } from "../../store/documents";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import type { DocumentInfo } from "../../lib/api";

type Props = {
  onClose: () => void;
};

const OTHER_KEY = "";
const OTHER_LABEL = "(기타)";

export default function DocumentPanel({ onClose }: Props) {
  const {
    documents,
    folderProgress,
    loadDocuments,
    uploadFile,
    uploadFiles,
    deleteDocument,
    retryFailedUploads,
  } = useDocumentsStore();
  const activeFolder = useChatStore((s) => s.activeFolder);
  const setActiveFolder = useChatStore((s) => s.setActiveFolder);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<DocumentInfo | null>(null);
  const [showFolderHint, setShowFolderHint] = useState(
    () => localStorage.getItem("seenFolderHint") !== "1"
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (activeFolder && showFolderHint) {
      localStorage.setItem("seenFolderHint", "1");
      setShowFolderHint(false);
    }
  }, [activeFolder, showFolderHint]);


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
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast.error("PDF 파일만 업로드 가능합니다.");
      return;
    }
    if (pdfs.length === 1) {
      uploadFile(pdfs[0]);
    } else {
      uploadFiles(pdfs, "");
    }
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
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? documents.filter(
          (d) =>
            d.filename.toLowerCase().includes(q) ||
            (d.folder ?? "").toLowerCase().includes(q)
        )
      : documents;
    const g = filtered.reduce<Record<string, DocumentInfo[]>>((acc, d) => {
      const key = d.folder || OTHER_KEY;
      (acc[key] ??= []).push(d);
      return acc;
    }, {});
    const named = Object.keys(g)
      .filter((k) => k !== OTHER_KEY)
      .sort((a, b) => a.localeCompare(b, "ko"));
    const keys = OTHER_KEY in g ? [...named, OTHER_KEY] : named;
    return { groups: g, orderedKeys: keys };
  }, [documents, searchQuery]);

  const isFolderExpanded = (key: string) => folderExpanded[key] ?? true;

  const toggleFolderExpanded = (key: string) => {
    setFolderExpanded((prev) => ({ ...prev, [key]: !isFolderExpanded(key) }));
  };

  const onActivateToggle = (folderName: string) => {
    if (folderName === OTHER_KEY) return;
    if (activeFolder === folderName) {
      setActiveFolder(null);
      toast("전체 문서 검색으로 돌아갔습니다");
    } else {
      setActiveFolder(folderName);
      toast.success(`'${folderName}' 폴더만 검색에 사용됩니다`);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--sidebar)",
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
          borderBottom: "1px solid var(--surface-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {I.folder}
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>문서 관리</span>
        </div>
        <Tb icon={I.x} tip="닫기" onClick={onClose} />
      </div>

      {/* Upload area */}
      <div style={{ padding: "10px 10px 8px", flexShrink: 0 }}>
        {folderProgress !== null ? (
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {I.upload}
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {folderProgress.total === 1
                    ? folderProgress.folderName
                    : `${folderProgress.folderName} (${folderProgress.done}/${folderProgress.total})`}
                </span>
              </div>
              {folderProgress.failed > 0 && (
                <span
                  title={`${folderProgress.failed}개 파일 처리 실패 — 각 파일별 오류는 알림을 확인하세요`}
                  style={{ fontSize: 11, color: "var(--warning)", flexShrink: 0, marginLeft: 8, cursor: "help" }}
                >
                  ⚠ {folderProgress.failed}개 실패
                </span>
              )}
              {folderProgress.hasRetry && (
                <button
                  onClick={retryFailedUploads}
                  style={{
                    flexShrink: 0,
                    marginLeft: 6,
                    background: "transparent",
                    border: "1px solid var(--warning)",
                    borderRadius: 4,
                    padding: "1px 7px",
                    fontSize: 11,
                    color: "var(--warning)",
                    cursor: "pointer",
                  }}
                >
                  재시도
                </button>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={folderProgress.done}
              aria-valuemin={0}
              aria-valuemax={folderProgress.total}
              style={{
                height: 3,
                background: "var(--border)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: "var(--primary)",
                  borderRadius: 2,
                  transform: `scaleX(${
                  folderProgress.chunkTotal > 0
                    ? (folderProgress.done + folderProgress.chunkDone / folderProgress.chunkTotal) / folderProgress.total
                    : folderProgress.done / folderProgress.total
                })`,
                  transformOrigin: "left",
                  transition: "transform 0.3s ease",
                }}
              />
            </div>
            {folderProgress.currentStatus && (
              <p
                aria-live="polite"
                style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}
              >
                {folderProgress.currentStatus}
              </p>
            )}
          </div>
        ) : (
          <>
            <div
              role="button"
              tabIndex={0}
              aria-label="PDF 파일 업로드. 클릭하거나 파일을 드래그하세요"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 10,
                padding: "16px 12px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                background: dragOver ? "color-mix(in oklch, var(--primary) 4%, transparent)" : "transparent",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!dragOver) {
                  e.currentTarget.style.borderColor = "var(--input)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
              onMouseLeave={(e) => {
                if (!dragOver) {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <div style={{ color: "var(--text-dim)" }}>{I.upload}</div>
              <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", lineHeight: 1.4 }}>
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
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.background = "color-mix(in oklch, var(--primary) 4%, transparent)";
                e.currentTarget.style.color = "var(--foreground)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
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
          {...{ webkitdirectory: "" }}
          style={{ display: "none" }}
          onChange={(e) => {
            handleFolderSelect(e.target.files);
            // 같은 폴더 재선택 가능하도록 리셋
            e.target.value = "";
          }}
        />
      </div>

      <div style={{ height: 1, background: "var(--surface-2)", flexShrink: 0, margin: "0 10px" }} />

      {/* Search */}
      {documents.length > 0 && (
        <div style={{ padding: "6px 10px 2px", flexShrink: 0 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="파일명 또는 폴더 검색..."
            style={{
              width: "100%",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "5px 10px",
              fontSize: 12,
              color: "var(--foreground)",
              boxSizing: "border-box",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--input)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>
      )}

      {/* Documents folder tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "문서 목록 접기" : "문서 목록 펼치기"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: "4px 2px",
            cursor: "pointer",
            marginBottom: 2,
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "flex" }}>
            {expanded ? I.chevDown : I.chevRight}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            인덱싱된 문서 ({documents.length})
          </span>
        </button>
        {expanded && documents.length > 0 && showFolderHint && (
          <p style={{ fontSize: 10, color: "var(--text-dim)", padding: "0 2px 6px", lineHeight: 1.4 }}>
            체크 버튼으로 폴더를 활성화하면 해당 폴더만 검색에 사용됩니다
          </p>
        )}

        {expanded && (
          <>
            {documents.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
                문서가 없습니다
              </p>
            ) : orderedKeys.length === 0 && searchQuery.trim() ? (
              <p style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
                일치하는 문서가 없습니다
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
                        border: isActive ? "1px solid var(--primary)" : "1px solid transparent",
                        background: isActive ? "color-mix(in oklch, var(--primary) 8%, transparent)" : "transparent",
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
                        <span style={{ color: "var(--text-dim)", display: "flex" }}>
                          {open ? I.chevDown : I.chevRight}
                        </span>
                        <span style={{ color: "var(--text-muted)", display: "flex" }}>{I.folder}</span>
                        <span
                          style={{
                            fontSize: 12,
                            color: isActive ? "var(--foreground)" : "var(--text-secondary)",
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
                        <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>
                          {docs.length}
                        </span>
                      </button>
                      {canActivate && (
                        <button
                          onClick={() => onActivateToggle(key)}
                          title={isActive ? "활성 폴더 해제" : "활성 폴더로 지정 (채팅 스코프 제한)"}
                          aria-label={isActive ? `${label} 폴더 활성화 해제` : `${label} 폴더만 검색에 사용`}
                          aria-pressed={isActive}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            background: isActive ? "var(--primary)" : "transparent",
                            border: `1px solid ${isActive ? "var(--primary)" : "var(--input)"}`,
                            color: isActive ? "var(--primary-foreground)" : "var(--text-dim)",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "background 0.1s, border-color 0.1s, color 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = "var(--primary)";
                              e.currentTarget.style.color = "var(--primary)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.borderColor = "var(--input)";
                              e.currentTarget.style.color = "var(--text-dim)";
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
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ color: "var(--text-dim)", marginTop: 1, flexShrink: 0 }}>
                            {I.file}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                marginBottom: 1,
                              }}
                              title={doc.filename}
                            >
                              {doc.filename}
                            </p>
                            <p style={{ fontSize: 10, color: "var(--text-dim)" }}>
                              {doc.chunk_count}청크 · {formatDate(doc.ingested_at)}
                            </p>
                          </div>
                          <Tb
                            icon={I.trash}
                            tip="삭제"
                            onClick={() => setDeleteTarget(doc)}
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="문서 삭제"
        description={`'${deleteTarget?.filename ?? ""}'을 삭제하시겠습니까? 인덱싱된 데이터가 모두 제거되며 되돌릴 수 없습니다.`}
        onAction={() => {
          if (deleteTarget) deleteDocument(deleteTarget.doc_id);
          setDeleteTarget(null);
        }}
      />

      <div style={{ height: 1, background: "var(--surface-2)", flexShrink: 0, margin: "0 10px" }} />

      {/* Context section */}
      <div style={{ padding: "10px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ color: "var(--text-dim)" }}>{I.globe}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            컨텍스트
          </span>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {activeFolder
            ? `'${activeFolder}' 폴더 문서만 검색에 사용됩니다.`
            : "업로드된 문서가 RAG 검색에 자동으로 사용됩니다."}
        </p>
      </div>
    </div>
  );
}
