import { UseModelStateReturn } from "../../hooks/use-model-state";
import { GlobalStyles } from "../../shared/ui/global-styles";
import { WinControls } from "../../shared/ui/win-controls";
import { dragRegionHandlers } from "../../shared/ui/drag-region";
import { cn } from "@/lib/utils";

const ERROR_ADVICE: Array<{ patterns: string[]; advice: string }> = [
  { patterns: ["disk", "space", "enospc", "storage", "no space"], advice: "디스크 여유 공간을 확인하세요." },
  { patterns: ["network", "connect", "timeout", "econnrefused", "fetch"], advice: "인터넷 연결을 확인하세요." },
  { patterns: ["permission", "access", "eacces", "eperm", "denied"], advice: "파일 쓰기 권한을 확인하거나 관리자 권한으로 실행하세요." },
];

function getErrorAdvice(reason: string | null): string | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  for (const { patterns, advice } of ERROR_ADVICE) {
    if (patterns.some((p) => lower.includes(p))) return advice;
  }
  return null;
}

type Props = { modelState: UseModelStateReturn };

const STAGE_LABELS: Record<string, string> = {
  idle: "시스템 확인 중...",
  verifying: "파일 검증 중...",
  switching: "모델 교체 중...",
  loading: "AI 모델 초기화 중...",
};

export default function SetupScreen({ modelState }: Props) {
  const {
    modelState: state,
    failureReason,
    downloadProgress,
    allModels,
    selectedModel,
    recommendedModel,
    ramGb,
    gpuName,
    selectModel,
    startInstall,
    cancelDownload,
  } = modelState;

  const isDownloading = state === "downloading";
  const isLoading = state === "verifying" || state === "switching" || state === "loading";
  const isInitializing = state === "idle" && ramGb === 0;
  const isFailed = state === "failed";
  const showModelSelect = state === "idle" && ramGb > 0;

  return (
    <>
      <GlobalStyles />
      <div className="flex flex-col h-screen bg-background text-foreground">
        {/* Drag region + window controls */}
        <div
          className="flex items-center justify-end h-[38px] shrink-0"
          {...dragRegionHandlers}
        >
          <WinControls />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[480px] flex flex-col gap-6 p-8 bg-sidebar border border-border rounded-sm shadow-[0_24px_48px_rgba(0,0,0,0.6)]">
            {/* 헤더 */}
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-xl font-bold text-foreground">
                  paperchat 설정
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)] leading-[1.5]">
                {isFailed ? "설치 중 오류가 발생했습니다" : "채팅에 사용할 AI 모델을 다운로드합니다"}
              </p>
            </div>

            {/* 하드웨어 정보 */}
            {ramGb > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <span className="px-2.5 py-[3px] bg-card border border-border rounded-xs text-xs text-[var(--text-secondary)] font-[tabular-nums] tracking-[0.01em]">
                  RAM {ramGb}GB
                </span>
                {gpuName && (
                  <span
                    title={gpuName}
                    className="px-2.5 py-[3px] bg-card border border-border rounded-xs text-xs text-[var(--text-secondary)] max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {gpuName}
                  </span>
                )}
              </div>
            )}

            {/* 모델 선택 */}
            {showModelSelect && (
              <div className="flex flex-col gap-2">
                <label htmlFor="model-select" className="text-sm font-medium text-[var(--text-secondary)]">
                  모델 선택
                </label>
                <select
                  id="model-select"
                  value={selectedModel?.filename ?? ""}
                  onChange={(e) => {
                    const model = allModels.find((m) => m.filename === e.target.value);
                    if (model) selectModel(model);
                  }}
                  className="w-full px-3 py-2 bg-card border border-border rounded-xs text-sm text-foreground cursor-pointer font-[inherit] outline-none"
                >
                  {allModels.map((m) => (
                    <option key={m.filename} value={m.filename}>
                      {m.name} ({m.size_gb}GB)
                      {m.filename === recommendedModel?.filename ? " ★ 권장" : ""}
                    </option>
                  ))}
                </select>
                {selectedModel && (
                  <p className="text-xs text-[var(--text-dim)] font-[tabular-nums]">
                    {selectedModel.size_gb}GB 다운로드 필요
                    {selectedModel.n_gpu_layers > 0 ? " · GPU 가속" : " · CPU 전용"}
                  </p>
                )}
              </div>
            )}

            {/* 로딩 (initializing / verifying / switching / loading) */}
            {(isInitializing || isLoading) && (
              <div className="flex items-center gap-2.5 text-[var(--text-dim)] text-sm">
                <span className="inline-block text-primary [animation:tp_1.2s_ease_infinite]">•</span>
                <span>{STAGE_LABELS[state] ?? "처리 중..."}</span>
              </div>
            )}

            {/* 다운로드 진행 */}
            {isDownloading && downloadProgress && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs text-[var(--text-muted)] font-[tabular-nums] tracking-[0.01em]">
                  <span>
                    {downloadProgress.downloadedMb.toFixed(0)}MB / {downloadProgress.totalMb.toFixed(0)}MB
                  </span>
                  <span>{downloadProgress.speedMbps.toFixed(1)} MB/s</span>
                </div>
                <div className="w-full h-1 bg-[var(--surface-2)] rounded-[1px] overflow-hidden">
                  <div
                    className="w-full h-full bg-primary rounded-[1px] origin-left transition-transform duration-300 ease"
                    style={{ transform: `scaleX(${downloadProgress.percent / 100})` }}
                  />
                </div>
                <p className="text-xs text-[var(--text-dim)] text-center font-[tabular-nums]">
                  {downloadProgress.percent}% 완료
                </p>
              </div>
            )}

            {/* 오류 메시지 */}
            {isFailed && failureReason && (
              <div className="px-3.5 py-2.5 bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] border border-[color-mix(in_oklch,var(--destructive)_25%,transparent)] rounded-xs text-xs text-[var(--text-muted)] leading-[1.6]">
                {failureReason}
                {getErrorAdvice(failureReason) && (
                  <p className="mt-1.5 text-[var(--text-secondary)] font-medium">
                    {getErrorAdvice(failureReason)}
                  </p>
                )}
              </div>
            )}

            {/* 버튼 */}
            {(showModelSelect || isDownloading || isFailed) && (
              <div>
                {isDownloading ? (
                  <button
                    onClick={cancelDownload}
                    className="w-full px-4 py-2.5 bg-transparent border border-[var(--input)] rounded-xs text-sm text-[var(--text-muted)] cursor-pointer font-[inherit] transition-[border-color,color] duration-150 hover:border-[var(--text-dim)] hover:text-[var(--text-secondary)]"
                  >
                    취소
                  </button>
                ) : (
                  <button
                    onClick={startInstall}
                    disabled={!selectedModel}
                    className={cn(
                      "w-full px-4 py-2.5 border-none rounded-xs text-sm font-semibold font-[inherit] transition-opacity duration-150",
                      selectedModel
                        ? "bg-primary text-background cursor-pointer hover:opacity-[0.88]"
                        : "bg-border text-[var(--text-dim)] cursor-not-allowed"
                    )}
                  >
                    {isFailed
                      ? "다시 시도"
                      : selectedModel
                      ? `${selectedModel.name} 다운로드 (${selectedModel.size_gb}GB)`
                      : "모델을 선택하세요"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
