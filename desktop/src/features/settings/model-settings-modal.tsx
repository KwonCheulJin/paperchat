import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useInstalledModels } from "../../hooks/use-installed-models";
import type { ModelInfo } from "../../hooks/use-model-state";
import { useModelState } from "../../hooks/use-model-state";
import { I } from "../../shared/ui/icons";
import { cn } from "@/lib/utils";
import { isErrorMonitorOptedIn, setErrorMonitorOptIn } from "../../lib/error-monitor";

function formatGB(bytes: number): string {
  return (bytes / 1_073_741_824).toFixed(1);
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ModelSettingsModal({ open, onClose }: Props) {
  const { models, catalog, recommendedFilename, loading, refresh, switchTo, remove, downloadNew } = useInstalledModels();
  const { modelState } = useModelState();
  const [optedIn, setOptedIn] = useState(isErrorMonitorOptedIn);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  const installedFilenames = new Set(models.map((m) => m.filename));
  const notInstalled = catalog.filter((m) => !installedFilenames.has(m.filename));
  const busy = ["downloading", "verifying", "switching", "loading"].includes(modelState);

  const profileOrder = ["micro", "nano", "minimal", "standard", "performance", "maximum"];
  const recommendedIndex = recommendedFilename
    ? profileOrder.indexOf(catalog.find((m) => m.filename === recommendedFilename)?.profile ?? "")
    : profileOrder.length - 1;
  const isTooLarge = (m: { profile: string }) =>
    recommendedIndex >= 0 && profileOrder.indexOf(m.profile) > recommendedIndex;

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-8"
    >
      <div className="bg-sidebar border border-border rounded w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.6)]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">모델 관리</h2>
            <p className="text-xs text-[var(--text-dim)] mt-0.5">
              사용할 AI 모델을 선택하거나 새 모델을 추가합니다
            </p>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-[var(--text-dim)] hover:text-foreground cursor-pointer p-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* 설치된 모델 */}
          <section>
            <h3 className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em] mb-2">
              설치된 모델
            </h3>
            {loading ? (
              <p className="text-xs text-[var(--text-dim)]">불러오는 중...</p>
            ) : models.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)]">설치된 모델이 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {models.map((m) => (
                  <li
                    key={m.filename}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xs border",
                      m.is_active
                        ? "bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] border-primary/30"
                        : "bg-card border-border",
                    )}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground truncate">
                          {m.meta?.name ?? m.filename}
                        </span>
                        {m.is_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-xs bg-primary/20 text-primary font-medium">
                            사용 중
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[var(--text-dim)] font-mono">
                        {formatGB(m.size_bytes)} GB
                        {m.meta?.n_gpu_layers ? " · GPU" : " · CPU"}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {!m.is_active && (
                        <button
                          onClick={() => switchTo(m.filename)}
                          disabled={busy}
                          className="px-2.5 py-1 text-xs rounded-xs bg-primary text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer font-[inherit]"
                        >
                          전환
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`${m.meta?.name ?? m.filename} 을 삭제하시겠습니까?`)) {
                            remove(m.filename).catch((e) => alert(String(e)));
                          }
                        }}
                        disabled={m.is_active || busy}
                        className="px-2.5 py-1 text-xs rounded-xs bg-transparent text-[var(--text-muted)] hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed border border-border cursor-pointer font-[inherit]"
                      >
                        {I.trash}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 추가 설치 가능 */}
          {notInstalled.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em] mb-2">
                추가 설치 가능
              </h3>
              <ul className="flex flex-col gap-1.5">
                {notInstalled.map((m: ModelInfo) => (
                  <li
                    key={m.filename}
                    className="flex items-center justify-between px-3 py-2 rounded-xs bg-card border border-border"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-foreground">{m.name}</span>
                      <span className="text-xs text-[var(--text-dim)] font-mono">
                        {m.size_gb} GB
                        {m.n_gpu_layers ? " · GPU" : " · CPU"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        downloadNew(m).catch((e) => alert(String(e)));
                        onClose();
                      }}
                      disabled={busy || isTooLarge(m)}
                      title={isTooLarge(m) ? "현재 시스템 사양을 초과하는 모델입니다" : undefined}
                      className="px-2.5 py-1 text-xs rounded-xs bg-transparent text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed border border-primary/40 cursor-pointer font-[inherit]"
                    >
                      {isTooLarge(m) ? "사양 초과" : "다운로드"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {busy && (
            <p className="text-xs text-[var(--text-dim)] text-center py-2">
              다른 작업이 진행 중입니다. 완료 후 다시 시도하세요.
            </p>
          )}

          {/* 에러 모니터링 */}
          <section>
            <h3 className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-[0.06em] mb-2">
              에러 모니터링
            </h3>
            <div className="flex items-center justify-between px-3 py-2 rounded-xs bg-card border border-border">
              <div className="flex flex-col">
                <span className="text-sm text-foreground">익명 에러 리포트</span>
                <span className="text-xs text-[var(--text-dim)]">
                  앱 오류를 자동 수집합니다. 변경 후 재시작 필요.
                </span>
              </div>
              <button
                role="switch"
                aria-checked={optedIn}
                onClick={() => {
                  const next = !optedIn;
                  setOptedIn(next);
                  setErrorMonitorOptIn(next);
                }}
                className={cn(
                  "relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors shrink-0",
                  optedIn
                    ? "bg-primary"
                    : "bg-[var(--text-muted)]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform",
                    optedIn ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
