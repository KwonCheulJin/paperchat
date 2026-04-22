import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useDocumentsStore } from "../../store/documents";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { Tb } from "../../shared/ui/toolbar-button";
import { AlertDialog } from "../../shared/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/tooltip";
import type { DocumentInfo } from "../../lib/api";
import { cn } from "@/lib/utils";

const OTHER_KEY = "";
const OTHER_LABEL = "(기타)";

export default function DocumentPanel() {
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

  const progressScale = folderProgress
    ? folderProgress.chunkTotal > 0
      ? (folderProgress.done + folderProgress.chunkDone / folderProgress.chunkTotal) / folderProgress.total
      : folderProgress.done / folderProgress.total
    : 0;

  return (
    <div className="flex flex-col h-full bg-sidebar overflow-hidden">
      {/* Upload area */}
      <div className="px-2.5 pt-3 pb-2 shrink-0">
        {folderProgress !== null ? (
          <div className="bg-card border border-border rounded-[10px] px-3.5 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                {I.upload}
                <span className="text-xs text-[var(--text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap">
                  {folderProgress.total === 1
                    ? folderProgress.folderName
                    : `${folderProgress.folderName} (${folderProgress.done}/${folderProgress.total})`}
                </span>
              </div>
              {folderProgress.failed > 0 && (
                <span
                  title={`${folderProgress.failed}개 파일 처리 실패 — 각 파일별 오류는 알림을 확인하세요`}
                  className="text-xs text-[var(--warning)] shrink-0 ml-2 cursor-help"
                >
                  ⚠ {folderProgress.failed}개 실패
                </span>
              )}
              {folderProgress.hasRetry && (
                <button
                  onClick={retryFailedUploads}
                  className="shrink-0 ml-1.5 bg-transparent border border-[var(--warning)] rounded-sm px-[7px] py-px text-xs text-[var(--warning)] cursor-pointer"
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
              className="h-[3px] bg-border rounded-xs overflow-hidden"
            >
              <div
                className="h-full w-full bg-primary rounded-xs origin-left transition-transform duration-300 ease"
                style={{ transform: `scaleX(${progressScale})` }}
              />
            </div>
            {folderProgress.currentStatus && (
              <p
                aria-live="polite"
                className="text-xs text-[var(--text-muted)] mt-[5px]"
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
              className={cn(
                "border border-dashed rounded-[10px] px-3 py-4 flex flex-col items-center gap-1.5 cursor-pointer transition-[border-color,background] duration-150",
                dragOver
                  ? "border-primary bg-[color-mix(in_oklch,var(--primary)_4%,transparent)]"
                  : "border-border bg-transparent hover:border-[var(--input)]"
              )}
            >
              <div className="text-[var(--text-dim)]">{I.upload}</div>
              <p className="text-xs text-[var(--text-dim)] text-center leading-[1.4]">
                PDF 드래그 또는 클릭하여 업로드
              </p>
            </div>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 bg-transparent border border-border rounded-lg px-2.5 py-2 text-[var(--text-secondary)] text-xs cursor-pointer transition-[border-color,background,color] duration-150 hover:border-primary hover:bg-[color-mix(in_oklch,var(--primary)_4%,transparent)] hover:text-foreground"
            >
              <span className="flex">{I.folder}</span>
              <span>폴더 선택</span>
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            handleSingleFile(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          className="hidden"
          onChange={(e) => {
            handleFolderSelect(e.target.files);
            e.target.value = "";
          }}
        />
      </div>


      {/* Search */}
      {documents.length > 0 && (
        <div className="px-2.5 pt-1.5 pb-0.5 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="파일명 또는 폴더 검색..."
            className="w-full bg-card border border-border rounded-[7px] px-2.5 py-[5px] text-xs text-foreground box-border outline-none focus:border-[var(--input)]"
          />
        </div>
      )}

      {/* Documents folder tree */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "문서 목록 접기" : "문서 목록 펼치기"}
          className="flex items-center gap-1.5 w-full bg-transparent border-none px-0.5 py-1 cursor-pointer mb-0.5"
        >
          <span className="text-[var(--text-dim)] flex">
            {expanded ? I.chevDown : I.chevRight}
          </span>
          <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">
            내 문서 ({documents.length})
          </span>
        </button>
        {expanded && documents.length > 0 && showFolderHint && (
          <p className="text-xs text-[var(--text-dim)] px-0.5 pb-1.5 leading-[1.4]">
            폴더를 체크하면 해당 폴더 문서에서만 답을 찾아드려요
          </p>
        )}

        {expanded && (
          <>
            {documents.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)] text-center py-3">
                문서가 없습니다
              </p>
            ) : orderedKeys.length === 0 && searchQuery.trim() ? (
              <p className="text-xs text-[var(--text-dim)] text-center py-3">
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
                  <div key={key || "__other__"} className="mb-1">
                    {/* Folder header */}
                    <div
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-[5px] rounded-[7px] border transition-[background,border-color] duration-100",
                        isActive
                          ? "border-primary bg-[color-mix(in_oklch,var(--primary)_8%,transparent)]"
                          : "border-transparent bg-transparent"
                      )}
                    >
                      <button
                        onClick={() => toggleFolderExpanded(key)}
                        className="flex items-center gap-1.5 flex-1 bg-transparent border-none p-0 cursor-pointer min-w-0 text-left"
                      >
                        <span className="text-[var(--text-dim)] flex">
                          {open ? I.chevDown : I.chevRight}
                        </span>
                        <span className="text-[var(--text-muted)] flex">{I.folder}</span>
                        <span
                          className={cn(
                            "text-sm overflow-hidden text-ellipsis whitespace-nowrap flex-1",
                            isActive
                              ? "text-foreground font-semibold"
                              : "text-[var(--text-secondary)] font-medium"
                          )}
                          title={label}
                        >
                          {label}
                        </span>
                        <span className="text-xs text-[var(--text-dim)] shrink-0">
                          {docs.length}
                        </span>
                      </button>
                      {canActivate && (
                        <button
                          onClick={() => onActivateToggle(key)}
                          title={isActive ? "활성 폴더 해제" : "활성 폴더로 지정 (채팅 스코프 제한)"}
                          aria-label={isActive ? `${label} 폴더 활성화 해제` : `${label} 폴더만 검색에 사용`}
                          aria-pressed={isActive}
                          className={cn(
                            "flex items-center justify-center w-[22px] h-[22px] rounded-[5px] cursor-pointer shrink-0 border transition-[background,border-color,color] duration-100",
                            isActive
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-transparent border-[var(--input)] text-[var(--text-dim)] hover:border-primary hover:text-primary"
                          )}
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
                          className="flex items-start gap-[7px] pl-[22px] pr-1.5 py-1.5 rounded-[7px] mb-px transition-colors duration-100 hover:bg-card"
                        >
                          <div className="text-[var(--text-dim)] mt-px shrink-0">
                            {I.file}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm text-[var(--text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap mb-px"
                              title={doc.filename}
                            >
                              {doc.filename}
                            </p>
                            <p className="text-xs text-[var(--text-dim)]">
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
        description={`'${deleteTarget?.filename ?? ""}'을 삭제하시겠습니까? 저장된 데이터가 모두 제거되며 되돌릴 수 없습니다.`}
        onAction={() => {
          if (deleteTarget) deleteDocument(deleteTarget.doc_id);
          setDeleteTarget(null);
        }}
      />


      {/* Context section */}
      <div className="px-3.5 py-2.5 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="답변 범위 설명 보기"
              className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-help text-left"
            >
              <span className="text-[var(--text-dim)]">{I.globe}</span>
              <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em]">
                답변 범위
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-[220px]">
            <p className="text-xs leading-[1.5]">
              {activeFolder
                ? `'${activeFolder}' 폴더의 문서에서만 답을 찾아드려요.`
                : "업로드하신 문서 전체에서 자동으로 답을 찾아드려요."}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
