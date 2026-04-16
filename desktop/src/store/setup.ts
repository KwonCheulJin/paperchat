import { create } from "zustand";
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

export type AppStatus =
  | "initializing"  // 앱 시작, model_status 이벤트 대기
  | "needs_model"   // 모델 없음 → SetupScreen 표시
  | "downloading"   // 다운로드 중
  | "starting_llm"  // 다운로드 완료, llama-server 초기화 중
  | "ready";        // 모델 있음 → ChatPage 표시

type SetupStore = {
  appStatus: AppStatus;
  allModels: ModelInfo[];
  selectedModel: ModelInfo | null;
  recommendedModel: ModelInfo | null;
  ramGb: number;
  gpuName: string;

  downloadPercent: number;
  downloadedMb: number;
  totalMb: number;
  speedMbps: number;

  initListeners: () => void;
  fetchModelStatus: () => Promise<void>;
  selectModel: (model: ModelInfo) => void;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
};

export const useSetupStore = create<SetupStore>((set, get) => ({
  appStatus: "initializing",
  allModels: [],
  selectedModel: null,
  recommendedModel: null,
  ramGb: 0,
  gpuName: "",

  downloadPercent: 0,
  downloadedMb: 0,
  totalMb: 0,
  speedMbps: 0,

  initListeners: () => {
    // model_status 이벤트: 모델 유무 판단
    // llama_ready가 리스너 등록 전에 발송됐을 수 있으므로 llama_running도 즉시 확인
    listen<{ has_model: boolean }>("model_status", async ({ payload }) => {
      if (payload.has_model) {
        try {
          const status = await invoke<{ llama_running: boolean }>("get_model_status");
          if (status.llama_running) {
            set({ appStatus: "ready" });
          } else {
            set({ appStatus: "starting_llm" });
          }
        } catch {
          set({ appStatus: "starting_llm" });
        }
      } else {
        get().fetchModelStatus();
      }
    });

    // download_progress 이벤트
    listen<{ percent: number; downloaded_mb: number; total_mb: number; speed_mbps: number }>(
      "download_progress",
      ({ payload }) => {
        set({
          downloadPercent: payload.percent,
          downloadedMb: payload.downloaded_mb,
          totalMb: payload.total_mb,
          speedMbps: payload.speed_mbps,
        });
      }
    );

    // download_done 이벤트: llama-server 초기화 대기 상태로 전환
    listen("download_done", () => {
      set({ appStatus: "starting_llm" });
    });

    // download_error 이벤트
    listen<string>("download_error", ({ payload }) => {
      set({ appStatus: "needs_model" });
      console.error("다운로드 오류:", payload);
    });

    // llama_ready 이벤트: 채팅 가능 상태
    listen("llama_ready", () => {
      set({ appStatus: "ready" });
    });

    // model_status 이벤트가 리스너 등록 전에 발송됐을 경우 대비:
    // 리스너 등록 직후 현재 상태를 직접 조회해 appStatus를 보정한다.
    invoke<{
      has_model: boolean;
      llama_running: boolean;
      ram_gb: number;
      gpu_name: string;
      all_models: ModelInfo[];
      recommended: ModelInfo;
    }>("get_model_status").then((result) => {
      // starting_llm에서 llama_ready를 놓친 경우도 보정한다.
      const currentStatus = get().appStatus;
      if (currentStatus !== "initializing" && currentStatus !== "starting_llm") return;

      if (result.llama_running) {
        set({ appStatus: "ready" });
      } else if (result.has_model) {
        // 모델 있음, llama-server 아직 시작 중 → llama_ready 이벤트 대기
        set({ appStatus: "starting_llm" });
      } else {
        set({
          appStatus: "needs_model",
          ramGb: result.ram_gb,
          gpuName: result.gpu_name,
          allModels: result.all_models,
          recommendedModel: result.recommended,
          selectedModel: result.recommended,
        });
      }
    }).catch(() => {});
  },

  fetchModelStatus: async () => {
    try {
      const result = await invoke<{
        has_model: boolean;
        llama_running: boolean;
        ram_gb: number;
        gpu_name: string;
        vram_gb: number;
        recommended: ModelInfo;
        all_models: ModelInfo[];
      }>("get_model_status");

      if (result.llama_running) {
        set({ appStatus: "ready" });
      } else if (result.has_model) {
        set({ appStatus: "starting_llm" });
      } else {
        set({
          appStatus: "needs_model",
          ramGb: result.ram_gb,
          gpuName: result.gpu_name,
          allModels: result.all_models,
          recommendedModel: result.recommended,
          selectedModel: result.recommended,
        });
      }
    } catch (e) {
      console.error("모델 상태 조회 실패:", e);
      set({ appStatus: "needs_model" });
    }
  },

  selectModel: (model) => set({ selectedModel: model }),

  startDownload: async () => {
    const { selectedModel } = get();
    if (!selectedModel) return;
    set({ appStatus: "downloading", downloadPercent: 0 });
    try {
      await invoke("download_model", {
        url: selectedModel.url,
        filename: selectedModel.filename,
      });
    } catch (e) {
      set({ appStatus: "needs_model" });
      console.error("다운로드 시작 실패:", e);
    }
  },

  cancelDownload: async () => {
    await invoke("cancel_download");
    set({ appStatus: "needs_model", downloadPercent: 0 });
  },
}));
