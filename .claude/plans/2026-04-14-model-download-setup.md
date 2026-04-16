# 모델 자동 다운로드 설치 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 최초 실행 시 GGUF 모델 파일이 없으면 하드웨어 프로필 기반 추천 모델을 프로그레스바와 함께 자동 다운로드하는 설치 화면을 제공한다.

**Architecture:** 앱 시작 시 Rust `setup()`이 모델 유무를 확인해 Tauri 이벤트(`model_status`)로 프론트에 알린다. React는 상태에 따라 `<SetupScreen>` 또는 `<ChatPage>`를 렌더링한다. 다운로드는 `download_model` Tauri 커맨드가 reqwest blocking으로 청크 단위 읽기 → `download_progress` 이벤트 스트림으로 프로그레스바를 업데이트한다.

**Tech Stack:** Rust (reqwest blocking, PowerShell 하드웨어 감지), TypeScript/React 18, Zustand 5, Tailwind CSS v3, Tauri 2 IPC

---

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `desktop/src-tauri/src/lib.rs` | 수정 | 모델 메타데이터, 하드웨어 감지, download_model 커맨드, setup() 이벤트 |
| `desktop/src/store/setup.ts` | 생성 | 설치 상태 Zustand 스토어 |
| `desktop/src/features/setup/setup-screen.tsx` | 생성 | 설치 UI 컴포넌트 (모델 선택 + 프로그레스바) |
| `desktop/src/app.tsx` | 수정 | model_status 이벤트 수신 → 화면 전환 |

---

## Task 1: Rust — 모델 메타데이터 + 하드웨어 감지

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs` (상수 섹션 뒤, `hidden_cmd` 정의 앞)

- [ ] **Step 1: `ModelInfo` 구조체 + 모델 목록 상수 추가**

`lib.rs`의 `CREATE_NO_WINDOW` 상수 블록 바로 뒤에 삽입:

```rust
#[derive(serde::Serialize, Clone)]
pub struct ModelInfo {
    pub profile: &'static str,
    pub name: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub size_gb: f32,
    pub n_gpu_layers: i32,
}

/// 다운로드 가능한 모델 목록 (프로필 순서)
pub const MODELS: &[ModelInfo] = &[
    ModelInfo {
        profile: "nano",
        name: "Gemma 3 1B",
        filename: "gemma-3-1b-it-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
        size_gb: 0.8,
        n_gpu_layers: 0,
    },
    ModelInfo {
        profile: "minimal",
        name: "Gemma 3 4B",
        filename: "gemma-3-4b-it-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf",
        size_gb: 2.5,
        n_gpu_layers: 0,
    },
    ModelInfo {
        profile: "standard",
        name: "Qwen3 8B",
        filename: "Qwen3-8B-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
        size_gb: 5.2,
        n_gpu_layers: 0,
    },
    ModelInfo {
        profile: "performance",
        name: "Qwen3 14B",
        filename: "Qwen3-14B-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf",
        size_gb: 9.0,
        n_gpu_layers: 99,
    },
    ModelInfo {
        profile: "maximum",
        name: "Qwen3 32B",
        filename: "Qwen3-32B-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen3-32B-GGUF/resolve/main/Qwen3-32B-Q4_K_M.gguf",
        size_gb: 20.0,
        n_gpu_layers: 99,
    },
];
```

- [ ] **Step 2: 하드웨어 감지 함수 추가**

`hidden_cmd` 함수 정의 바로 아래에 추가:

```rust
/// RAM 용량 GB 반환 (PowerShell)
fn get_ram_gb() -> u64 {
    let output = hidden_cmd("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"])
        .output();
    output.ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(|bytes| bytes / (1024 * 1024 * 1024))
        .unwrap_or(8)
}

/// NVIDIA GPU 이름 + VRAM(GB) 반환
fn get_gpu_info() -> (bool, String, u64) {
    let output = hidden_cmd("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output();
    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            let line = text.lines().map(|l| l.trim()).find(|l| !l.is_empty()).unwrap_or("");
            if !line.is_empty() {
                let parts: Vec<&str> = line.splitn(2, ',').collect();
                let name = parts[0].trim().to_string();
                let vram_gb = parts.get(1).and_then(|s| s.trim().parse::<u64>().ok()).unwrap_or(0) / 1024;
                if !name.is_empty() {
                    return (true, name, vram_gb);
                }
            }
        }
    }
    (false, String::new(), 0)
}

/// 하드웨어 기반 권장 프로필 + 모델 결정
fn recommended_model(ram_gb: u64, has_gpu: bool, vram_gb: u64) -> &'static ModelInfo {
    let profile = if ram_gb >= 64 && has_gpu && vram_gb >= 24 { "maximum" }
        else if ram_gb >= 32 && has_gpu { "performance" }
        else if ram_gb >= 16 { "standard" }
        else if ram_gb >= 8  { "minimal" }
        else                  { "nano" };
    MODELS.iter().find(|m| m.profile == profile).unwrap_or(&MODELS[2])
}
```

- [ ] **Step 3: `get_model_status` 커맨드 추가 (commands 모듈 내)**

`commands` 모듈 안 `get_backend_status` 함수 바로 뒤에 추가:

```rust
#[derive(serde::Serialize, Clone)]
pub struct ModelStatusResult {
    pub has_model: bool,
    pub model_path: String,
    pub ram_gb: u64,
    pub gpu_name: String,
    pub vram_gb: u64,
    pub recommended: crate::ModelInfo,
    pub all_models: Vec<crate::ModelInfo>,
}

#[tauri::command]
pub fn get_model_status(app_handle: tauri::AppHandle) -> Result<ModelStatusResult, String> {
    let data_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let (has_model, model_path) = match crate::resolve_model(&data_dir) {
        Some((p, _)) => (true, p.to_string_lossy().to_string()),
        None => (false, String::new()),
    };
    let ram_gb = crate::get_ram_gb();
    let (has_gpu, gpu_name, vram_gb) = crate::get_gpu_info();
    let recommended = crate::recommended_model(ram_gb, has_gpu, vram_gb).clone();
    Ok(ModelStatusResult {
        has_model,
        model_path,
        ram_gb,
        gpu_name,
        vram_gb,
        recommended,
        all_models: crate::MODELS.to_vec(),
    })
}
```

- [ ] **Step 4: `invoke_handler`에 `get_model_status` 등록**

`lib.rs` `run()` 함수의 `invoke_handler` 목록에 추가:

```rust
commands::get_model_status,
```

- [ ] **Step 5: 빌드 확인**

```bash
cd desktop
cargo build 2>&1 | grep -E "^error"
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add desktop/src-tauri/src/lib.rs
git commit -m "feat: 모델 메타데이터 + 하드웨어 감지 + get_model_status 커맨드"
```

---

## Task 2: Rust — download_model 커맨드

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: 다운로드 취소 플래그 전역 변수 추가**

`BACKEND_PROCESS` 정의 바로 아래에 추가:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);
```

- [ ] **Step 2: `DownloadProgressEvent` 구조체 추가**

`ModelStatusResult` 정의 아래에 추가:

```rust
#[derive(serde::Serialize, Clone)]
pub struct DownloadProgressEvent {
    pub percent: u8,
    pub downloaded_mb: f64,
    pub total_mb: f64,
    pub speed_mbps: f64,
}
```

- [ ] **Step 3: `download_model` 커맨드 추가 (commands 모듈 내)**

```rust
#[tauri::command]
pub fn download_model(
    window: tauri::Window,
    url: String,
    filename: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    crate::DOWNLOAD_CANCELLED.store(false, std::sync::atomic::Ordering::SeqCst);

    std::thread::spawn(move || {
        use std::io::{Read, Write};
        use tauri::Emitter;

        let data_dir = app_handle.path().app_local_data_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
        let models_dir = data_dir.join("models");
        let _ = std::fs::create_dir_all(&models_dir);

        let tmp_path = models_dir.join(format!("{}.tmp", &filename));
        let final_path = models_dir.join(&filename);

        // 이미 완료된 파일이 있으면 스킵
        if final_path.exists() {
            window.emit("download_progress", crate::DownloadProgressEvent {
                percent: 100, downloaded_mb: 0.0, total_mb: 0.0, speed_mbps: 0.0,
            }).ok();
            window.emit("download_done", &filename).ok();
            return;
        }

        let client = reqwest::blocking::Client::builder()
            .timeout(None)
            .build()
            .unwrap();

        let mut resp = match client.get(&url).send() {
            Ok(r) => r,
            Err(e) => {
                window.emit("download_error", format!("연결 실패: {}", e)).ok();
                return;
            }
        };

        let total = resp.content_length().unwrap_or(0);
        let total_mb = total as f64 / 1_048_576.0;

        let mut file = match std::fs::File::create(&tmp_path) {
            Ok(f) => f,
            Err(e) => {
                window.emit("download_error", format!("파일 생성 실패: {}", e)).ok();
                return;
            }
        };

        let mut downloaded = 0u64;
        let mut buf = vec![0u8; 65536];
        let start = std::time::Instant::now();
        let mut last_emit = std::time::Instant::now();

        loop {
            if crate::DOWNLOAD_CANCELLED.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = std::fs::remove_file(&tmp_path);
                window.emit("download_error", "다운로드가 취소됐습니다.").ok();
                return;
            }

            let n = match resp.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(e) => {
                    window.emit("download_error", format!("읽기 오류: {}", e)).ok();
                    return;
                }
            };

            if let Err(e) = file.write_all(&buf[..n]) {
                window.emit("download_error", format!("쓰기 오류: {}", e)).ok();
                return;
            }

            downloaded += n as u64;

            // 300ms 간격으로 진행률 이벤트
            if last_emit.elapsed().as_millis() >= 300 {
                last_emit = std::time::Instant::now();
                let elapsed = start.elapsed().as_secs_f64().max(0.001);
                let speed_mbps = (downloaded as f64 / 1_048_576.0) / elapsed;
                let percent = if total > 0 {
                    ((downloaded as f64 / total as f64) * 100.0) as u8
                } else { 0 };

                window.emit("download_progress", crate::DownloadProgressEvent {
                    percent,
                    downloaded_mb: downloaded as f64 / 1_048_576.0,
                    total_mb,
                    speed_mbps,
                }).ok();
            }
        }

        // 완료: tmp → 최종 경로
        drop(file);
        if let Err(e) = std::fs::rename(&tmp_path, &final_path) {
            window.emit("download_error", format!("파일 이동 실패: {}", e)).ok();
            return;
        }

        window.emit("download_progress", crate::DownloadProgressEvent {
            percent: 100,
            downloaded_mb: total_mb,
            total_mb,
            speed_mbps: 0.0,
        }).ok();
        window.emit("download_done", &filename).ok();
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_download() -> Result<(), String> {
    crate::DOWNLOAD_CANCELLED.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}
```

- [ ] **Step 4: `invoke_handler`에 등록**

```rust
commands::download_model,
commands::cancel_download,
```

- [ ] **Step 5: 빌드 확인**

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: 오류 없음

- [ ] **Step 6: 커밋**

```bash
git add desktop/src-tauri/src/lib.rs
git commit -m "feat: download_model + cancel_download 커맨드"
```

---

## Task 3: Rust — setup() 이벤트 발송 수정

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs` (`run()` 내 setup 블록)

현재 setup() 흐름: 백엔드 시작 → 모델 확인 → 창 표시
변경 후: 백엔드 시작 → 창 **즉시** 표시 → `model_status` 이벤트 발송

- [ ] **Step 1: setup() 스레드 블록 교체**

`run()` 내 `std::thread::spawn` 블록 전체를 아래로 교체:

```rust
std::thread::spawn(move || {
    use tauri::Manager;
    use tauri::Emitter;

    let data_dir = app_handle.path().app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("./data"));

    {
        let mut p = LOG_PATH.lock().unwrap();
        *p = Some(data_dir.join("tauri.log"));
    }
    log_info!("DocRAG 시작 — data_dir={}", data_dir.display());

    // 백엔드 시작
    match launch_backend(&data_dir) {
        Ok(()) => log_info!("backend.exe 시작 완료"),
        Err(e) => log_error!("backend.exe 시작 실패: {}", e),
    }

    // backend 준비 대기 (최대 60초)
    if wait_for_port(BACKEND_PORT, 60) {
        log_info!("backend 포트 {} 준비 완료", BACKEND_PORT);
    } else {
        log_error!("backend 포트 {} 대기 시간 초과 (60s)", BACKEND_PORT);
    }

    // 창 먼저 표시
    log_info!("창 표시");
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    // 모델 상태 이벤트 발송 (프론트가 SetupScreen/ChatPage 결정에 사용)
    let has_model = resolve_model(&data_dir).is_some();
    log_info!("모델 상태: has_model={}", has_model);

    if let Some(window) = app_handle.get_webview_window("main") {
        window.emit("model_status", serde_json::json!({ "has_model": has_model })).ok();
    }

    // 모델이 있으면 llama-server도 시작
    if let Some((model_path, n_gpu_layers)) = resolve_model(&data_dir) {
        log_info!("모델 발견: {} (n_gpu_layers={})", model_path.display(), n_gpu_layers);
        match launch_llama_server(&model_path, n_gpu_layers) {
            Ok(()) => log_info!("llama-server 시작 완료"),
            Err(e) => log_error!("llama-server 시작 실패: {}", e),
        }
        if wait_for_port(LLAMA_PORT, 120) {
            log_info!("llama-server 포트 {} 준비 완료", LLAMA_PORT);
        } else {
            log_error!("llama-server 포트 {} 대기 시간 초과 (120s)", LLAMA_PORT);
        }
        // llama 준비 완료 이벤트
        if let Some(window) = app_handle.get_webview_window("main") {
            window.emit("llama_ready", true).ok();
        }
    }
});
```

- [ ] **Step 2: 빌드 확인**

```bash
cargo build 2>&1 | grep -E "^error"
```
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add desktop/src-tauri/src/lib.rs
git commit -m "feat: setup() - 창 즉시 표시 + model_status 이벤트 발송"
```

---

## Task 4: Frontend — setup store

**Files:**
- Create: `desktop/src/store/setup.ts`

- [ ] **Step 1: `desktop/src/store/setup.ts` 생성**

```typescript
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
  | "initializing"   // 앱 시작, model_status 이벤트 대기
  | "needs_model"    // 모델 없음 → SetupScreen 표시
  | "downloading"    // 다운로드 중
  | "ready";         // 모델 있음 → ChatPage 표시

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
    listen<{ has_model: boolean }>("model_status", ({ payload }) => {
      if (payload.has_model) {
        set({ appStatus: "ready" });
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

    // download_done 이벤트: 다운로드 완료 → llama_ready 대기
    listen("download_done", () => {
      // llama-server는 Rust에서 자동 시작됨, llama_ready 이벤트 대기
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
  },

  fetchModelStatus: async () => {
    try {
      const result = await invoke<{
        has_model: boolean;
        ram_gb: number;
        gpu_name: string;
        vram_gb: number;
        recommended: ModelInfo;
        all_models: ModelInfo[];
      }>("get_model_status");

      if (result.has_model) {
        set({ appStatus: "ready" });
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
```

- [ ] **Step 2: 커밋**

```bash
git add desktop/src/store/setup.ts
git commit -m "feat: setup store - 모델 상태 + 다운로드 상태 관리"
```

---

## Task 5: Frontend — SetupScreen UI

**Files:**
- Create: `desktop/src/features/setup/setup-screen.tsx`

- [ ] **Step 1: `desktop/src/features/setup/` 폴더 생성 + `setup-screen.tsx` 작성**

```tsx
import { useSetupStore } from "../../store/setup";

export default function SetupScreen() {
  const {
    appStatus,
    allModels,
    selectedModel,
    recommendedModel,
    ramGb,
    gpuName,
    downloadPercent,
    downloadedMb,
    totalMb,
    speedMbps,
    selectModel,
    startDownload,
    cancelDownload,
  } = useSetupStore();

  const isDownloading = appStatus === "downloading";

  return (
    <div className="flex h-screen bg-background items-center justify-center">
      <div className="w-[480px] flex flex-col gap-6 p-8 border border-border rounded-xl bg-card shadow-lg">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-foreground">DocRAG 설정</h1>
          <p className="text-sm text-muted-foreground mt-1">
            채팅에 사용할 AI 모델을 다운로드합니다
          </p>
        </div>

        {/* 하드웨어 정보 */}
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="px-2 py-1 bg-accent rounded-md">RAM {ramGb}GB</span>
          {gpuName && (
            <span className="px-2 py-1 bg-accent rounded-md truncate max-w-[200px]" title={gpuName}>
              {gpuName}
            </span>
          )}
        </div>

        {/* 모델 선택 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">모델 선택</label>
          <select
            value={selectedModel?.filename ?? ""}
            onChange={(e) => {
              const model = allModels.find((m) => m.filename === e.target.value);
              if (model) selectModel(model);
            }}
            disabled={isDownloading}
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {allModels.map((m) => (
              <option key={m.filename} value={m.filename}>
                {m.name} ({m.size_gb}GB)
                {m.filename === recommendedModel?.filename ? " ★ 권장" : ""}
              </option>
            ))}
          </select>
          {selectedModel && (
            <p className="text-xs text-muted-foreground">
              {selectedModel.size_gb}GB 다운로드 필요
              {selectedModel.n_gpu_layers > 0 ? " · GPU 가속" : " · CPU 전용"}
            </p>
          )}
        </div>

        {/* 프로그레스바 (다운로드 중일 때만) */}
        {isDownloading && (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {downloadedMb.toFixed(0)}MB / {totalMb.toFixed(0)}MB
              </span>
              <span>{speedMbps.toFixed(1)} MB/s</span>
            </div>
            <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {downloadPercent}% 완료
            </p>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          {isDownloading ? (
            <button
              onClick={cancelDownload}
              className="flex-1 px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              취소
            </button>
          ) : (
            <button
              onClick={startDownload}
              disabled={!selectedModel}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedModel
                ? `${selectedModel.name} 다운로드 (${selectedModel.size_gb}GB)`
                : "모델을 선택하세요"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add desktop/src/features/setup/setup-screen.tsx
git commit -m "feat: SetupScreen UI - 모델 선택 + 프로그레스바"
```

---

## Task 6: Frontend — app.tsx 화면 전환

**Files:**
- Modify: `desktop/src/app.tsx`

- [ ] **Step 1: `app.tsx` 교체**

```tsx
import { useEffect } from "react";
import { Toaster } from "sonner";
import ChatPage from "./features/chat/chat-page";
import SetupScreen from "./features/setup/setup-screen";
import { useSetupStore } from "./store/setup";

export default function App() {
  const { appStatus, initListeners } = useSetupStore();

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  return (
    <>
      {appStatus === "ready" ? <ChatPage /> : <SetupScreen />}
      <Toaster position="top-right" richColors />
    </>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd desktop
pnpm build
```
Expected: TypeScript 오류 없음

- [ ] **Step 3: Tauri 빌드 및 설치 테스트**

```bash
pnpm tauri build
```

모델이 없는 상태에서 앱 실행 시 SetupScreen이 나타나는지 확인:
1. `C:\Users\{USER}\AppData\Local\com.docrag.desktop\models\` 폴더가 비어 있는지 확인
2. 앱 실행 → SetupScreen 표시 확인
3. 모델 선택 후 다운로드 버튼 클릭 → 프로그레스바 진행 확인
4. 다운로드 완료 후 → ChatPage 자동 전환 확인

- [ ] **Step 4: 커밋**

```bash
git add desktop/src/app.tsx
git commit -m "feat: app.tsx - model_status 기반 SetupScreen/ChatPage 전환"
```
