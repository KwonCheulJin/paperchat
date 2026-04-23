import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModelInfo } from "./use-model-state";

export type InstalledModel = {
  filename: string;
  size_bytes: number;
  is_active: boolean;
  meta: ModelInfo | null;
};

export function useInstalledModels() {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await invoke<InstalledModel[]>("list_installed_models");
      setModels(list);
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

  return { models, loading, error, refresh, switchTo, remove, downloadNew };
}
