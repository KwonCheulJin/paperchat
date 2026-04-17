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

  useEffect(() => {
    // 마운트 시 현재 상태 동기 조회 (이벤트 유실 방지)
    invoke<RustModelState>("get_model_state").then((s) => {
      setRustState(s);
      if (s.state === "idle" && s.all_models.length > 0) {
        const rec = s.all_models.find((m) => m.filename === s.recommended_filename);
        setSelectedModel((prev) => prev ?? rec ?? s.all_models[0]);
      }
    }).catch(() => {});

    // 라이프사이클 이벤트 구독
    const unlisten = listen<RustModelState>("model-state-changed", ({ payload }) => {
      setRustState(payload);
      if (payload.state === "idle" && payload.all_models.length > 0) {
        const rec = payload.all_models.find((m) => m.filename === payload.recommended_filename);
        setSelectedModel((prev) => prev ?? rec ?? payload.all_models[0]);
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const idleData = rustState.state === "idle" ? (rustState as IdleState) : null;
  const dlData = rustState.state === "downloading" ? (rustState as DownloadingState) : null;

  return {
    modelState: rustState.state,
    failureReason: rustState.state === "failed" ? (rustState as { state: "failed"; reason: string }).reason : null,
    downloadProgress: dlData
      ? { percent: dlData.percent, downloadedMb: dlData.downloaded_mb, totalMb: dlData.total_mb, speedMbps: dlData.speed_mbps }
      : null,
    allModels: idleData?.all_models ?? [],
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
