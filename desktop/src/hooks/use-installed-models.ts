import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "./use-model-state";

export type InstalledModel = {
  filename: string;
  size_bytes: number;
  is_active: boolean;
  meta: ModelInfo | null;
};

type ModelStatusResult = {
  all_models: ModelInfo[];
  recommended: ModelInfo;
};

export function useInstalledModels() {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [catalog, setCatalog] = useState<ModelInfo[]>([]);
  const [recommendedFilename, setRecommendedFilename] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [list, status] = await Promise.all([
        invoke<InstalledModel[]>("list_installed_models"),
        invoke<ModelStatusResult>("get_model_status"),
      ]);
      setModels(list);
      setCatalog(status.all_models);
      setRecommendedFilename(status.recommended.filename);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchTo = useCallback(
    async (filename: string) => {
      await invoke("switch_model", { filename });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (filename: string) => {
      await invoke("delete_model", { filename });
      await refresh();
    },
    [refresh],
  );

  const downloadNew = useCallback(async (m: ModelInfo) => {
    await invoke("install_model", {
      url: m.url,
      filename: m.filename,
      nGpuLayers: m.n_gpu_layers,
    });
  }, []);

  return { models, catalog, recommendedFilename, loading, error, refresh, switchTo, remove, downloadNew };
}
