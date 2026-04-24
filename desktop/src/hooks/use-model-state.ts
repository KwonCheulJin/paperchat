import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ModelInfo = {
  profile: string;
  name: string;
  filename: string;
  url: string;
  size_gb: number;
  n_gpu_layers: number;
};

type IdleState = {
  state: "idle";
  ram_gb: number;
  gpu_name: string;
  vram_gb: number;
  recommended_filename: string;
  all_models: ModelInfo[];
};

type DownloadingState = {
  state: "downloading";
  percent: number;
  downloaded_mb: number;
  total_mb: number;
  speed_mbps: number;
};

type RustModelState =
  | IdleState
  | DownloadingState
  | { state: "verifying" }
  | { state: "switching" }
  | { state: "loading" }
  | { state: "ready" }
  | { state: "failed"; reason: string };

export type ModelStateKind = RustModelState["state"];

export type UseModelStateReturn = {
  modelState: ModelStateKind;
  failureReason: string | null;
  downloadProgress: { percent: number; downloadedMb: number; totalMb: number; speedMbps: number } | null;
  allModels: ModelInfo[];
  selectedModel: ModelInfo | null;
  recommendedModel: ModelInfo | null;
  ramGb: number;
  gpuName: string;
  selectModel: (model: ModelInfo) => void;
  startInstall: () => Promise<void>;
  cancelDownload: () => Promise<void>;
};

export function useModelState(): UseModelStateReturn {
  const [rustState, setRustState] = useState<RustModelState>({ state: "idle", ram_gb: 0, gpu_name: "", vram_gb: 0, recommended_filename: "", all_models: [] });
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [cachedAllModels, setCachedAllModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    let active = true;

    const applyState = (s: RustModelState) => {
      if (!active) return;
      setRustState(s);
      if (s.state === "idle" && s.all_models.length > 0) {
        setCachedAllModels(s.all_models);
        const rec = s.all_models.find((m) => m.filename === s.recommended_filename);
        setSelectedModel((prev) => prev ?? rec ?? s.all_models[0]);
      }
    };

    // 리스너를 먼저 등록한 뒤 현재 상태를 조회 — 이벤트 유실 방지
    // (웹뷰는 visible:false 상태에서도 JS 실행, 백그라운드 스레드가 emit하기 전에
    //  invoke가 초기 빈 상태를 반환하는 타이밍 레이스 차단)
    const setup = async () => {
      const unlistenFn = await listen<RustModelState>("model-state-changed", ({ payload }) => {
        applyState(payload);
      });

      try {
        const s = await invoke<RustModelState>("get_model_state");
        applyState(s);
      } catch {}

      return unlistenFn;
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const idleData = rustState.state === "idle" ? (rustState as IdleState) : null;
  const dlData = rustState.state === "downloading" ? (rustState as DownloadingState) : null;

  return {
    modelState: rustState.state,
    failureReason: rustState.state === "failed" ? (rustState as { state: "failed"; reason: string }).reason : null,
    downloadProgress: dlData
      ? { percent: dlData.percent, downloadedMb: dlData.downloaded_mb, totalMb: dlData.total_mb, speedMbps: dlData.speed_mbps }
      : null,
    allModels: idleData?.all_models ?? cachedAllModels,
    recommendedModel: idleData
      ? (idleData.all_models.find((m) => m.filename === idleData.recommended_filename) ?? null)
      : null,
    ramGb: idleData?.ram_gb ?? 0,
    gpuName: idleData?.gpu_name ?? "",
    selectedModel,
    selectModel: setSelectedModel,
    startInstall: async () => {
      if (!selectedModel) return;
      await invoke("install_model", {
        url: selectedModel.url,
        filename: selectedModel.filename,
        nGpuLayers: selectedModel.n_gpu_layers,
      });
    },
    cancelDownload: () => invoke("cancel_download"),
  };
}
