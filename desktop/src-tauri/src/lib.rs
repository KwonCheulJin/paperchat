use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::io::Write;

const BACKEND_PORT: u16 = 8000;
const LLAMA_PORT: u16 = 11434;
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 로그 파일 경로 (data_dir 확정 전에는 None)
static LOG_PATH: Lazy<Mutex<Option<std::path::PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// 타임스탬프 문자열 반환
fn now_str() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("T+{}s", t)
}

/// 로그 파일에 한 줄 기록 (level: INFO/WARN/ERROR)
fn log_to_file(level: &str, msg: &str) {
    let path_guard = LOG_PATH.lock().unwrap();
    if let Some(path) = path_guard.as_ref() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "[{}] [{}] {}", now_str(), level, msg);
        }
    }
    eprintln!("[{}] {}", level, msg);
}

macro_rules! log_info  { ($($arg:tt)*) => { log_to_file("INFO",  &format!($($arg)*)) } }
macro_rules! log_warn  { ($($arg:tt)*) => { log_to_file("WARN",  &format!($($arg)*)) } }
macro_rules! log_error { ($($arg:tt)*) => { log_to_file("ERROR", &format!($($arg)*)) } }

// ─── 모델 메타데이터 ────────────────────────────────────────────────────────

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
        name: "Gemma 4 E2B",
        filename: "google_gemma-4-E2B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf",
        size_gb: 3.5,
        n_gpu_layers: 0,
    },
    ModelInfo {
        profile: "minimal",
        name: "Gemma 4 E4B",
        filename: "google_gemma-4-E4B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/resolve/main/google_gemma-4-E4B-it-Q4_K_M.gguf",
        size_gb: 5.4,
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

// ─── 다운로드 진행 이벤트 ────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct DownloadProgressEvent {
    pub percent: u8,
    pub downloaded_mb: f64,
    pub total_mb: f64,
    pub speed_mbps: f64,
}

// ─── 공통 타입 ───────────────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct BackendStatus {
    pub backend_running: bool,
    pub llm_running: bool,
}

// ─── 프로세스 핸들 ───────────────────────────────────────────────────────────

/// FastAPI sidecar 프로세스 핸들
static BACKEND_PROCESS: Lazy<Mutex<Option<std::process::Child>>> =
    Lazy::new(|| Mutex::new(None));
/// llama-server sidecar 프로세스 핸들
static LLAMA_PROCESS: Lazy<Mutex<Option<std::process::Child>>> =
    Lazy::new(|| Mutex::new(None));
/// 다운로드 취소 플래그
static DOWNLOAD_CANCELLED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

// ─── 유틸리티 함수 ───────────────────────────────────────────────────────────

fn hidden_cmd(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn is_port_open(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

/// 앱 실행 파일이 위치한 디렉토리 반환
fn app_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .ok_or_else(|| "실행 파일 경로 없음".into())
        .map(|p| p.to_path_buf())
}

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
                let vram_gb = parts.get(1)
                    .and_then(|s| s.trim().parse::<u64>().ok())
                    .unwrap_or(0) / 1024;
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

/// 포트가 열릴 때까지 대기 (최대 max_secs 초)
fn wait_for_port(port: u16, max_secs: u64) -> bool {
    for _ in 0..max_secs {
        if is_port_open(port) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    false
}

/// 인스톨러가 저장한 config 구조체
#[derive(serde::Deserialize)]
struct InstallerConfig {
    install_path: String,
    model_file: String,
    n_gpu_layers: i32,
}

/// 인스톨러 config 읽기 (%APPDATA%\paperchat\config.json)
fn load_installer_config() -> Option<InstallerConfig> {
    let appdata = std::env::var("APPDATA").ok()?;
    let path = std::path::Path::new(&appdata)
        .join("paperchat")
        .join("config.json");
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 모델 파일 경로 결정: 인스톨러 config → 없으면 data_dir/models/*.gguf 탐색
fn resolve_model(data_dir: &std::path::Path) -> Option<(std::path::PathBuf, i32)> {
    // 1순위: 인스톨러 config
    if let Some(cfg) = load_installer_config() {
        let model_path = std::path::Path::new(&cfg.install_path)
            .join("models")
            .join(&cfg.model_file);
        if model_path.exists() {
            return Some((model_path, cfg.n_gpu_layers));
        }
    }

    // 2순위: data_dir/models/ 폴더에서 .gguf 탐색 (수동 배치 / 다운로드 완료)
    let models_dir = data_dir.join("models");
    let model_path = std::fs::read_dir(&models_dir).ok()?.find_map(|entry| {
        let path = entry.ok()?.path();
        if path.extension()?.to_str()? == "gguf" { Some(path) } else { None }
    })?;
    Some((model_path, 0))
}

/// 백엔드 프로세스 시작 (내부 공용 로직)
fn launch_backend(data_dir: &std::path::Path) -> Result<(), String> {
    if is_port_open(BACKEND_PORT) {
        return Ok(());
    }

    let mut guard = BACKEND_PROCESS.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }

    let dir = app_dir()?;
    let backend_bin = dir.join("backend.exe");
    let chroma_path = data_dir.join("chroma");
    let sqlite_path = data_dir.join("paperchat.db");
    let _ = std::fs::create_dir_all(&chroma_path);

    let log_path = data_dir.join("backend.log");
    let stdout_log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok();
    let stderr_log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok();

    let child = if backend_bin.exists() {
        let mut cmd = hidden_cmd(backend_bin.to_str().unwrap());
        cmd.env("CHROMA_PATH", chroma_path.to_str().unwrap_or("./data/chroma"))
           .env("SQLITE_PATH", sqlite_path.to_str().unwrap_or("./data/paperchat.db"));
        if let Some(f) = stdout_log { cmd.stdout(f); }
        if let Some(f) = stderr_log { cmd.stderr(f); }
        cmd.spawn().map_err(|e| format!("FastAPI 시작 실패: {}", e))?
    } else {
        hidden_cmd("uvicorn")
            .args(["app.main:app", "--host", "127.0.0.1", "--port", "8000"])
            .current_dir("../backend")
            .spawn()
            .map_err(|e| format!("uvicorn 시작 실패: {}", e))?
    };

    *guard = Some(child);
    Ok(())
}

/// llama-server 프로세스 시작 (내부 공용 로직)
fn launch_llama_server(model_path: &std::path::Path, n_gpu_layers: i32) -> Result<(), String> {
    let mut guard = LLAMA_PROCESS.lock().unwrap();
    if guard.is_some() {
        return Ok(());
    }

    let dir = app_dir()?;
    let llama_bin = dir.join("llama-server.exe");

    // ggml_backend_load_all()은 exe와 같은 디렉토리에서 ggml-*.dll을 탐색한다.
    // Tauri NSIS 번들은 DLL을 $INSTDIR/binaries/ 에 설치하므로
    // exe 디렉토리($INSTDIR/)로 복사해 백엔드 로딩이 가능하게 한다.
    let binaries_dir = dir.join("binaries");
    if binaries_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&binaries_dir) {
            for entry in entries.flatten() {
                let src = entry.path();
                if src.extension().map(|e| e.eq_ignore_ascii_case("dll")).unwrap_or(false) {
                    let dest = dir.join(entry.file_name());
                    if !dest.exists() {
                        if let Err(e) = std::fs::copy(&src, &dest) {
                            log_error!("DLL 복사 실패 {:?} → {:?}: {}", src, dest, e);
                        }
                    }
                }
            }
        }
    }

    let existing_path = std::env::var("PATH").unwrap_or_default();
    let dll_path = format!("{};{}", dir.to_string_lossy(), existing_path);

    let child = hidden_cmd(llama_bin.to_str().unwrap_or("llama-server"))
        .args([
            "--model", model_path.to_str().unwrap_or(""),
            "--host", "127.0.0.1",
            "--port", "11434",
            "--ctx-size", "8192",
            "--n-gpu-layers", &n_gpu_layers.to_string(),
            "--cache-type-k", "q4_0",
            "--cache-type-v", "q4_0",
            "--flash-attn", "on",
            "--cache-reuse", "256",
        ])
        .env("PATH", &dll_path)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("llama-server 시작 실패: {}", e))?;

    *guard = Some(child);
    Ok(())
}

// ─── Tauri 커맨드 ────────────────────────────────────────────────────────────

mod commands {
    use crate::{BACKEND_PORT, LLAMA_PORT, BackendStatus, hidden_cmd, LLAMA_PROCESS, app_dir, is_port_open, launch_backend};
    use tauri::Manager;

    #[tauri::command]
    pub fn get_backend_status() -> Result<BackendStatus, String> {
        Ok(BackendStatus {
            backend_running: is_port_open(BACKEND_PORT),
            llm_running: is_port_open(LLAMA_PORT),
        })
    }

    #[tauri::command]
    pub fn start_backend(app_handle: tauri::AppHandle) -> Result<(), String> {
        let data_dir = app_handle.path().app_local_data_dir()
            .map_err(|e| e.to_string())?;
        launch_backend(&data_dir)
    }

    #[tauri::command]
    pub fn start_llama_server(
        model_path: String,
        n_gpu_layers: i32,
    ) -> Result<(), String> {
        crate::launch_llama_server(std::path::Path::new(&model_path), n_gpu_layers)
    }

    #[tauri::command]
    pub fn stop_all_sidecars() -> Result<(), String> {
        use crate::BACKEND_PROCESS;
        if let Some(mut child) = BACKEND_PROCESS.lock().unwrap().take() {
            let _ = child.kill();
        }
        if let Some(mut child) = LLAMA_PROCESS.lock().unwrap().take() {
            let _ = child.kill();
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn pick_pdf_files() -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    #[tauri::command]
    pub fn read_logs(app_handle: tauri::AppHandle) -> Result<String, String> {
        let data_dir = app_handle.path().app_local_data_dir()
            .map_err(|e| e.to_string())?;

        let mut output = String::new();
        for (label, filename) in [("=== tauri.log ===", "tauri.log"), ("=== backend.log ===", "backend.log")] {
            let path = data_dir.join(filename);
            output.push_str(label);
            output.push('\n');
            if path.exists() {
                let content = std::fs::read_to_string(&path).unwrap_or_default();
                let lines: Vec<&str> = content.lines().collect();
                let start = lines.len().saturating_sub(200);
                for line in &lines[start..] {
                    output.push_str(line);
                    output.push('\n');
                }
            } else {
                output.push_str("(파일 없음)\n");
            }
            output.push('\n');
        }
        Ok(output)
    }

    // ── 모델 상태 조회 ──────────────────────────────────────────────────────

    #[derive(serde::Serialize, Clone)]
    pub struct ModelStatusResult {
        pub has_model: bool,
        pub llama_running: bool,
        pub model_path: String,
        pub ram_gb: u64,
        pub gpu_name: String,
        pub vram_gb: u64,
        pub recommended: crate::ModelInfo,
        pub all_models: Vec<crate::ModelInfo>,
    }

    #[tauri::command]
    pub fn get_model_status(app_handle: tauri::AppHandle) -> Result<ModelStatusResult, String> {
        let data_dir = app_handle.path().app_local_data_dir()
            .map_err(|e| e.to_string())?;
        let (has_model, model_path) = match crate::resolve_model(&data_dir) {
            Some((p, _)) => (true, p.to_string_lossy().to_string()),
            None => (false, String::new()),
        };
        let llama_running = crate::is_port_open(crate::LLAMA_PORT);
        let ram_gb = crate::get_ram_gb();
        let (has_gpu, gpu_name, vram_gb) = crate::get_gpu_info();
        let recommended = crate::recommended_model(ram_gb, has_gpu, vram_gb).clone();
        Ok(ModelStatusResult {
            has_model,
            llama_running,
            model_path,
            ram_gb,
            gpu_name,
            vram_gb,
            recommended,
            all_models: crate::MODELS.to_vec(),
        })
    }

    // ── 모델 다운로드 ────────────────────────────────────────────────────────

    #[tauri::command]
    pub fn download_model(
        window: tauri::Window,
        url: String,
        filename: String,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        use std::sync::atomic::Ordering;
        crate::DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);

        std::thread::spawn(move || {
            use std::io::{Read, Write};
            use tauri::Emitter;

            let data_dir = app_handle.path().app_local_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
            let models_dir = data_dir.join("models");
            let _ = std::fs::create_dir_all(&models_dir);

            let tmp_path = models_dir.join(format!("{}.tmp", &filename));
            let final_path = models_dir.join(&filename);

            // 이미 완료된 파일이 있으면 스킵 → 바로 llama-server 기동
            if final_path.exists() {
                window.emit("download_progress", crate::DownloadProgressEvent {
                    percent: 100, downloaded_mb: 0.0, total_mb: 0.0, speed_mbps: 0.0,
                }).ok();
                window.emit("download_done", &filename).ok();
                start_llama_after_download(&window, &final_path, &filename);
                return;
            }

            let client = match reqwest::blocking::Client::builder().timeout(None).build() {
                Ok(c) => c,
                Err(e) => {
                    window.emit("download_error", format!("클라이언트 생성 실패: {}", e)).ok();
                    return;
                }
            };

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
            start_llama_after_download(&window, &final_path, &filename);
        });

        Ok(())
    }

    /// 다운로드 완료 후 llama-server를 기동하고 llama_ready 이벤트를 발송한다.
    fn start_llama_after_download(
        window: &tauri::Window,
        model_path: &std::path::Path,
        filename: &str,
    ) {
        use tauri::Emitter;
        let n_gpu_layers = crate::MODELS.iter()
            .find(|m| m.filename == filename)
            .map(|m| m.n_gpu_layers)
            .unwrap_or(0);

        match crate::launch_llama_server(model_path, n_gpu_layers) {
            Ok(()) => {
                if crate::wait_for_port(crate::LLAMA_PORT, 120) {
                    window.emit("llama_ready", true).ok();
                } else {
                    window.emit("download_error", "llama-server 시작 대기 시간 초과 (120s)").ok();
                }
            }
            Err(e) => {
                window.emit("download_error", format!("llama-server 시작 실패: {}", e)).ok();
            }
        }
    }

    #[tauri::command]
    pub fn cancel_download() -> Result<(), String> {
        use std::sync::atomic::Ordering;
        crate::DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
        Ok(())
    }
}

// ─── Tauri 앱 진입점 ─────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                use tauri::Manager;
                use tauri::Emitter;

                let data_dir = app_handle.path().app_local_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("./data"));

                {
                    let mut p = LOG_PATH.lock().unwrap();
                    *p = Some(data_dir.join("tauri.log"));
                }
                log_info!("paperchat 시작 — data_dir={}", data_dir.display());

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

                // 창 먼저 표시 (SetupScreen or ChatPage는 프론트가 결정)
                log_info!("창 표시");
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // 모델 상태 이벤트 발송 (프론트가 SetupScreen/ChatPage 전환에 사용)
                let has_model = resolve_model(&data_dir).is_some();
                log_info!("모델 상태: has_model={}", has_model);

                if let Some(window) = app_handle.get_webview_window("main") {
                    window.emit("model_status", serde_json::json!({ "has_model": has_model })).ok();
                }

                // 모델이 있으면 llama-server 시작 → 준비되면 llama_ready 이벤트
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
                    if let Some(window) = app_handle.get_webview_window("main") {
                        window.emit("llama_ready", true).ok();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_status,
            commands::start_backend,
            commands::start_llama_server,
            commands::stop_all_sidecars,
            commands::pick_pdf_files,
            commands::read_logs,
            commands::get_model_status,
            commands::download_model,
            commands::cancel_download,
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(mut child) = BACKEND_PROCESS.lock().unwrap().take() {
                    let _ = child.kill();
                }
                if let Some(mut child) = LLAMA_PROCESS.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
