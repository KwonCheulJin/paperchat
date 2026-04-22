use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::io::Write;

const BACKEND_PORT: u16 = 8000;
const LLAMA_PORT: u16 = 11434;
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ─── Windows Job Object (부모 종료 시 자식 자동 종료) ────────────────────────
#[cfg(windows)]
mod job {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
        JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    struct Handle(*mut c_void);
    unsafe impl Send for Handle {}
    unsafe impl Sync for Handle {}

    static JOB_HANDLE: std::sync::OnceLock<Handle> = std::sync::OnceLock::new();

    pub fn init() {
        let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if job.is_null() { return; }

        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        unsafe {
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
        }
        let _ = JOB_HANDLE.set(Handle(job));
    }

    pub fn assign(child: &std::process::Child) {
        let job = match JOB_HANDLE.get() { Some(h) => h.0, None => return };
        let handle = child.as_raw_handle() as *mut c_void;
        unsafe { AssignProcessToJobObject(job, handle) };
    }
}

// ─── 로그 ──────────────────────────────────────────────────────────────────

static LOG_PATH: Lazy<Mutex<Option<std::path::PathBuf>>> = Lazy::new(|| Mutex::new(None));

fn now_str() -> String {
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("T+{}s", t)
}

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
macro_rules! log_error { ($($arg:tt)*) => { log_to_file("ERROR", &format!($($arg)*)) } }

// ─── 모델 메타데이터 ────────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct ModelInfo {
    pub profile: &'static str,
    pub name: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub size_gb: f32,
    pub n_gpu_layers: i32,
}

pub const MODELS: &[ModelInfo] = &[
    ModelInfo {
        profile: "nano",
        name: "Gemma 4 E2B",
        filename: "google_gemma-4-E2B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf",
        size_gb: 3.2,
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

// ─── 다운로드 취소 플래그 ────────────────────────────────────────────────────

static DOWNLOAD_CANCELLED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

// ─── ModelState (라이프사이클 상태 머신) ─────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ModelState {
    /// 모델 없음 — 사용자 선택 대기. 하드웨어 정보 포함.
    Idle {
        ram_gb: u64,
        gpu_name: String,
        vram_gb: u64,
        recommended_filename: String,
        all_models: Vec<ModelInfo>,
    },
    /// 다운로드 중
    Downloading {
        percent: u8,
        downloaded_mb: f64,
        total_mb: f64,
        speed_mbps: f64,
    },
    /// 파일 크기 검증 중
    Verifying,
    /// 기존 llama-server 종료 중
    Switching,
    /// llama-server 모델 로딩 중
    Loading,
    /// 모델 로드 완료 — 채팅 가능
    Ready,
    /// 오류 발생
    Failed { reason: String },
}

pub struct ModelStateStore(pub Mutex<ModelState>);

impl ModelStateStore {
    pub fn new() -> Self {
        Self(Mutex::new(ModelState::Idle {
            ram_gb: 0,
            gpu_name: String::new(),
            vram_gb: 0,
            recommended_filename: String::new(),
            all_models: vec![],
        }))
    }

    pub fn get(&self) -> ModelState {
        self.0.lock().unwrap().clone()
    }

    pub fn set_and_emit(&self, app: &tauri::AppHandle, state: ModelState) {
        use tauri::Emitter;
        *self.0.lock().unwrap() = state.clone();
        let _ = app.emit("model-state-changed", &state);
    }
}

// ─── ProcessManager ──────────────────────────────────────────────────────────

struct ProcessManager {
    server: Option<std::process::Child>,
    llm: Option<std::process::Child>,
}

impl ProcessManager {
    fn new() -> Self {
        Self { server: None, llm: None }
    }

    /// paperchat-server 기동 (orphan 정리 내장)
    fn spawn_server(&mut self, data_dir: &std::path::Path) -> Result<(), String> {
        // 이전 실행에서 남은 orphan 프로세스 정리 (구 이름 backend.exe 포함)
        #[cfg(windows)]
        {
            let _ = hidden_cmd("taskkill")
                .args(["/F", "/IM", "paperchat-server.exe", "/T"])
                .output();
            let _ = hidden_cmd("taskkill")
                .args(["/F", "/IM", "backend.exe", "/T"])
                .output();
        }
        std::thread::sleep(std::time::Duration::from_millis(500));

        if is_port_open(BACKEND_PORT) {
            return Ok(());
        }

        if let Some(mut child) = self.server.take() {
            let _ = child.kill();
        }

        let child = launch_server_process(data_dir)?;
        #[cfg(windows)]
        job::assign(&child);
        self.server = Some(child);
        Ok(())
    }

    /// llama-server 재시작 — Mutex 내부에서 kill-then-spawn 원자성 보장
    fn spawn_llm(&mut self, model_path: &std::path::Path, n_gpu_layers: i32) -> Result<(), String> {
        if let Some(mut child) = self.llm.take() {
            let _ = child.kill();
            // 포트 해제 대기 (최대 2초)
            for _ in 0..10 {
                if !is_port_open(LLAMA_PORT) { break; }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }

        let child = launch_llm_process(model_path, n_gpu_layers)?;
        #[cfg(windows)]
        job::assign(&child);
        self.llm = Some(child);
        Ok(())
    }

    fn kill_llm(&mut self) {
        if let Some(mut child) = self.llm.take() {
            let _ = child.kill();
        }
    }

    fn shutdown_all(&mut self) {
        if let Some(mut child) = self.server.take() { let _ = child.kill(); }
        if let Some(mut child) = self.llm.take() { let _ = child.kill(); }
    }
}

pub struct ProcessManagerState(pub Mutex<ProcessManager>);

// ─── 유틸리티 함수 ───────────────────────────────────────────────────────────

#[cfg(windows)]
fn hidden_cmd(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
fn hidden_cmd(program: &str) -> std::process::Command {
    std::process::Command::new(program)
}

fn is_port_open(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

fn app_dir() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    exe.parent()
        .ok_or_else(|| "실행 파일 경로 없음".into())
        .map(|p| p.to_path_buf())
}

fn get_ram_gb() -> u64 {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output();
        if let Some(bytes) = output.ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
        {
            return bytes / (1024 * 1024 * 1024);
        }
    }
    #[cfg(windows)]
    {
        let output = hidden_cmd("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"])
            .output();
        if let Some(bytes) = output.ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
        {
            return bytes / (1024 * 1024 * 1024);
        }
    }
    8
}

fn get_gpu_info() -> (bool, String, u64) {
    #[cfg(target_os = "macos")]
    {
        // Apple Silicon: unified memory, GPU 이름은 ioreg로 빠르게 읽기
        // system_profiler는 수십 초 블록 가능성 있어 사용 안 함
        let output = std::process::Command::new("ioreg")
            .args(["-l", "-n", "AGXAccelerator", "-d", "1"])
            .output();
        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("\"IOClass\"") {
                    // GPU 존재 확인만 → 이름은 칩셋에서 유추
                    break;
                }
            }
        }
        // 칩 이름은 sysctl로 빠르게 읽기
        let chip_name = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if !chip_name.is_empty() {
            return (true, chip_name, 0);
        }
        return (false, String::new(), 0);
    }
    #[cfg(not(target_os = "macos"))]
    {
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
}

fn recommended_model(ram_gb: u64, has_gpu: bool, vram_gb: u64) -> &'static ModelInfo {
    let profile = if ram_gb >= 64 && has_gpu && vram_gb >= 24 { "maximum" }
        else if ram_gb >= 32 && has_gpu { "performance" }
        else if ram_gb >= 16 { "standard" }
        else if ram_gb >= 8  { "minimal" }
        else                  { "nano" };
    MODELS.iter().find(|m| m.profile == profile).unwrap_or(&MODELS[2])
}

fn wait_for_port(port: u16, max_secs: u64) -> bool {
    for _ in 0..max_secs {
        if is_port_open(port) { return true; }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    false
}

/// /v1/models 응답으로 모델 로딩 완료 확인 (지수 백오프 폴링, 최대 timeout_secs)
fn wait_until_loaded(port: u16, timeout_secs: u64) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/v1/models", port);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    let mut delay = std::time::Duration::from_secs(1);
    loop {
        if std::time::Instant::now() >= deadline {
            return Err(format!("모델 로딩 {}초 초과", timeout_secs));
        }
        if let Ok(resp) = reqwest::blocking::get(&url) {
            if resp.status().is_success() {
                if let Ok(text) = resp.text() {
                    // data 배열이 비어있지 않으면 모델 로드 완료
                    if text.contains("\"data\"") && !text.contains("\"data\":[]") {
                        return Ok(());
                    }
                }
            }
        }
        std::thread::sleep(delay);
        delay = (delay * 2).min(std::time::Duration::from_secs(8));
    }
}

#[derive(serde::Deserialize)]
struct InstallerConfig {
    install_path: String,
    model_file: String,
    n_gpu_layers: i32,
}

fn load_installer_config() -> Option<InstallerConfig> {
    let appdata = std::env::var("APPDATA").ok()?;
    let path = std::path::Path::new(&appdata)
        .join("paperchat")
        .join("config.json");
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn resolve_model(data_dir: &std::path::Path) -> Option<(std::path::PathBuf, i32)> {
    if let Some(cfg) = load_installer_config() {
        let model_path = std::path::Path::new(&cfg.install_path)
            .join("models")
            .join(&cfg.model_file);
        if model_path.exists() {
            return Some((model_path, cfg.n_gpu_layers));
        }
    }
    let models_dir = data_dir.join("models");
    let model_path = std::fs::read_dir(&models_dir).ok()?.find_map(|entry| {
        let path = entry.ok()?.path();
        if path.extension()?.to_str()? == "gguf" { Some(path) } else { None }
    })?;
    Some((model_path, 0))
}

fn find_tesseract() -> Option<String> {
    let candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ];
    for path in candidates.iter() {
        if std::path::Path::new(path).exists() {
            return Some((*path).to_string());
        }
    }
    None
}

// ─── 프로세스 빌더 ────────────────────────────────────────────────────────────

/// paperchat-server (FastAPI) 프로세스 생성
fn launch_server_process(data_dir: &std::path::Path) -> Result<std::process::Child, String> {
    let dir = app_dir()?;
    let server_bin = {
        #[cfg(windows)]
        let names = ["paperchat-server.exe", "backend.exe"];
        #[cfg(not(windows))]
        let names = ["paperchat-server", "backend"];
        names.iter().map(|n| dir.join(n)).find(|p| p.exists())
            .unwrap_or_else(|| dir.join(names[0]))
    };

    let chroma_path = data_dir.join("chroma");
    let sqlite_path = data_dir.join("paperchat.db");
    let _ = std::fs::create_dir_all(&chroma_path);

    let log_path = data_dir.join("backend.log");
    let stdout_log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok();
    let stderr_log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).ok();

    if server_bin.exists() {
        let mut cmd = hidden_cmd(server_bin.to_str().unwrap());
        cmd.env("CHROMA_PATH", chroma_path.to_str().unwrap_or("./data/chroma"))
           .env("SQLITE_PATH", sqlite_path.to_str().unwrap_or("./data/paperchat.db"));
        if let Some(tess) = find_tesseract() {
            log_info!("Tesseract 감지: {}", tess);
            cmd.env("TESSERACT_CMD", &tess);
        }
        if let Some(f) = stdout_log { cmd.stdout(f); }
        if let Some(f) = stderr_log { cmd.stderr(f); }
        cmd.spawn().map_err(|e| format!("paperchat-server 시작 실패: {}", e))
    } else {
        hidden_cmd("uvicorn")
            .args(["app.main:app", "--host", "127.0.0.1", "--port", "8000"])
            .current_dir("../backend")
            .spawn()
            .map_err(|e| format!("uvicorn 시작 실패: {}", e))
    }
}

/// llama-server 프로세스 생성
fn launch_llm_process(
    model_path: &std::path::Path,
    n_gpu_layers: i32,
) -> Result<std::process::Child, String> {
    let dir = app_dir()?;
    #[cfg(windows)]
    let llama_bin = dir.join("llama-server.exe");
    #[cfg(not(windows))]
    let llama_bin = dir.join("llama-server");

    // ggml 백엔드 DLL이 binaries/ 에 있으면 $INSTDIR/ 로 복사
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
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| (n.get() / 2).max(2))
        .unwrap_or(2)
        .to_string();

    hidden_cmd(llama_bin.to_str().unwrap_or("llama-server"))
        .args([
            "--model", model_path.to_str().unwrap_or(""),
            "--host", "127.0.0.1",
            "--port", "11434",
            "--ctx-size", "4096",
            "--threads", &cpu_threads,
            "--batch-size", "256",
            "--n-gpu-layers", &n_gpu_layers.to_string(),
            "--cache-type-k", "q4_0",
            "--cache-type-v", "q4_0",
            "--flash-attn", "on",
            "--cache-reuse", "256",
        ])
        .env("PATH", &dll_path)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("llama-server 시작 실패: {}", e))
}

// ─── 다운로드 + 설치 라이프사이클 ─────────────────────────────────────────────

enum DownloadOutcome {
    Done,
    Cancelled,
}

fn download_file(
    app: &tauri::AppHandle,
    url: &str,
    final_path: &std::path::Path,
    filename: &str,
) -> Result<DownloadOutcome, String> {
    use std::io::Read;
    use std::sync::atomic::Ordering;
    use tauri::Manager;

    let model_store = app.state::<ModelStateStore>();
    let tmp_path = final_path.with_extension("gguf.tmp");

    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .build()
        .map_err(|e| format!("클라이언트 생성 실패: {}", e))?;

    let mut resp = client.get(url).send()
        .map_err(|e| format!("연결 실패: {}", e))?;

    let total = resp.content_length().unwrap_or(0);
    let total_mb = total as f64 / 1_048_576.0;

    let mut file = std::fs::File::create(&tmp_path)
        .map_err(|e| format!("파일 생성 실패: {}", e))?;

    let mut downloaded = 0u64;
    let mut buf = vec![0u8; 65536];
    let start = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();

    loop {
        if DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(&tmp_path);
            // 취소 시 하드웨어 정보와 함께 Idle 복귀
            let ram_gb = get_ram_gb();
            let (has_gpu, gpu_name, vram_gb) = get_gpu_info();
            let recommended = recommended_model(ram_gb, has_gpu, vram_gb);
            model_store.set_and_emit(app, ModelState::Idle {
                ram_gb, gpu_name, vram_gb,
                recommended_filename: recommended.filename.to_string(),
                all_models: MODELS.to_vec(),
            });
            return Ok(DownloadOutcome::Cancelled);
        }

        let n = match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("읽기 오류: {}", e));
            }
        };

        file.write_all(&buf[..n])
            .map_err(|e| format!("쓰기 오류: {}", e))?;
        downloaded += n as u64;

        if last_emit.elapsed().as_millis() >= 300 {
            last_emit = std::time::Instant::now();
            let elapsed = start.elapsed().as_secs_f64().max(0.001);
            let speed_mbps = (downloaded as f64 / 1_048_576.0) / elapsed;
            let percent = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u8
            } else { 0 };
            model_store.set_and_emit(app, ModelState::Downloading {
                percent,
                downloaded_mb: downloaded as f64 / 1_048_576.0,
                total_mb,
                speed_mbps,
            });
        }
    }

    drop(file);
    std::fs::rename(&tmp_path, final_path)
        .map_err(|e| format!("파일 이동 실패: {}", e))?;

    log_info!("다운로드 완료: {} ({:.0}MB)", filename, total_mb);
    Ok(DownloadOutcome::Done)
}

/// install_model 커맨드의 전체 라이프사이클 (별도 스레드에서 실행)
fn run_install_lifecycle(
    app: tauri::AppHandle,
    url: String,
    filename: String,
    n_gpu_layers: i32,
) {
    use tauri::Manager;

    let model_store = app.state::<ModelStateStore>();
    let proc_mgr_state = app.state::<ProcessManagerState>();

    let data_dir = app.path().app_local_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("./data"));
    let models_dir = data_dir.join("models");
    let _ = std::fs::create_dir_all(&models_dir);
    let final_path = models_dir.join(&filename);

    // ── Downloading (이미 파일 있으면 스킵) ────────────────────────────────
    if !final_path.exists() {
        model_store.set_and_emit(&app, ModelState::Downloading {
            percent: 0, downloaded_mb: 0.0, total_mb: 0.0, speed_mbps: 0.0,
        });
        match download_file(&app, &url, &final_path, &filename) {
            Ok(DownloadOutcome::Cancelled) => return,
            Ok(DownloadOutcome::Done) => {},
            Err(reason) => {
                log_error!("다운로드 실패: {}", reason);
                model_store.set_and_emit(&app, ModelState::Failed { reason });
                return;
            }
        }
    }

    // ── Verifying (파일 존재 확인) ──────────────────────────────────────────
    // 다운로드 완료(Done) 시 HTTP 클라이언트가 전송 완료를 보장하므로 크기 검증 불필요
    model_store.set_and_emit(&app, ModelState::Verifying);
    if !final_path.exists() || std::fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0) == 0 {
        let reason = "다운로드 파일을 찾을 수 없습니다".to_string();
        log_error!("{}", reason);
        model_store.set_and_emit(&app, ModelState::Failed { reason });
        return;
    }

    // ── Switching (기존 llama-server 종료 후 재시작) ─────────────────────────
    model_store.set_and_emit(&app, ModelState::Switching);
    // 외부에서 이미 실행 중이면 스폰 건너뜀
    if !is_port_open(LLAMA_PORT) {
        if let Err(e) = proc_mgr_state.0.lock().unwrap().spawn_llm(&final_path, n_gpu_layers) {
            // 스폰 실패했지만 포트가 열렸다면 외부 서버 사용
            if !is_port_open(LLAMA_PORT) {
                log_error!("llama-server 재시작 실패: {}", e);
                model_store.set_and_emit(&app, ModelState::Failed { reason: e });
                return;
            }
            log_info!("spawn_llm 실패하나 포트 {} 이미 열림 — 외부 서버 감지", LLAMA_PORT);
        }
    } else {
        log_info!("llama-server 이미 실행 중 (포트 {}) — 외부 서버 사용", LLAMA_PORT);
    }

    // ── Loading (모델 로딩 완료 대기) ────────────────────────────────────────
    model_store.set_and_emit(&app, ModelState::Loading);
    log_info!("llama-server 모델 로딩 대기...");
    match wait_until_loaded(LLAMA_PORT, 60) {
        Ok(()) => {
            log_info!("모델 로딩 완료 → Ready");
            model_store.set_and_emit(&app, ModelState::Ready);
        }
        Err(reason) => {
            log_error!("모델 로딩 실패: {}", reason);
            proc_mgr_state.0.lock().unwrap().kill_llm();
            model_store.set_and_emit(&app, ModelState::Failed {
                reason: format!("{} — RAM/VRAM 부족 가능성", reason),
            });
        }
    }
}

// ─── Tauri 커맨드 ────────────────────────────────────────────────────────────

mod commands {
    use crate::{
        BACKEND_PORT, LLAMA_PORT, is_port_open,
        ModelState, ModelStateStore, ProcessManagerState,
        run_install_lifecycle, DOWNLOAD_CANCELLED, MODELS,
        get_ram_gb, get_gpu_info, recommended_model, resolve_model,
    };
    use tauri::Manager;

    #[derive(serde::Serialize)]
    pub struct BackendStatus {
        pub backend_running: bool,
        pub llm_running: bool,
    }

    #[tauri::command]
    pub fn get_backend_status() -> Result<BackendStatus, String> {
        Ok(BackendStatus {
            backend_running: is_port_open(BACKEND_PORT),
            llm_running: is_port_open(LLAMA_PORT),
        })
    }

    #[tauri::command]
    pub fn get_model_state(app: tauri::AppHandle) -> ModelState {
        app.state::<ModelStateStore>().get()
    }

    #[tauri::command]
    pub fn stop_all_sidecars(app: tauri::AppHandle) -> Result<(), String> {
        app.state::<ProcessManagerState>().0.lock().unwrap().shutdown_all();
        Ok(())
    }

    #[tauri::command]
    pub fn close_app(app: tauri::AppHandle) {
        std::thread::spawn(move || {
            app.state::<ProcessManagerState>().0.lock().unwrap().shutdown_all();
            app.exit(0);
        });
    }

    #[tauri::command]
    pub async fn pick_pdf_files() -> Result<Vec<String>, String> {
        Ok(vec![])
    }

    #[tauri::command]
    pub fn read_logs(app: tauri::AppHandle) -> Result<String, String> {
        let data_dir = app.path().app_local_data_dir()
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

    /// 하드웨어 정보 + 모델 유무 (디버깅/호환성 유지용)
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
    pub fn get_model_status(app: tauri::AppHandle) -> Result<ModelStatusResult, String> {
        let data_dir = app.path().app_local_data_dir()
            .map_err(|e| e.to_string())?;
        let (has_model, model_path) = match resolve_model(&data_dir) {
            Some((p, _)) => (true, p.to_string_lossy().to_string()),
            None => (false, String::new()),
        };
        let llama_running = is_port_open(LLAMA_PORT);
        let ram_gb = get_ram_gb();
        let (has_gpu, gpu_name, vram_gb) = get_gpu_info();
        let recommended = recommended_model(ram_gb, has_gpu, vram_gb).clone();
        Ok(ModelStatusResult {
            has_model, llama_running, model_path,
            ram_gb, gpu_name, vram_gb,
            recommended,
            all_models: MODELS.to_vec(),
        })
    }

    /// 모델 다운로드 + 설치 전체 라이프사이클 시작
    #[tauri::command]
    pub fn install_model(
        app: tauri::AppHandle,
        url: String,
        filename: String,
        n_gpu_layers: i32,
    ) -> Result<(), String> {
        use std::sync::atomic::Ordering;

        // 이미 진행 중이면 거부
        let current = app.state::<ModelStateStore>().get();
        match current {
            ModelState::Idle { .. } | ModelState::Failed { .. } | ModelState::Ready => {},
            _ => return Err("이미 설치 중입니다".into()),
        }

        DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);
        std::thread::spawn(move || {
            run_install_lifecycle(app, url, filename, n_gpu_layers);
        });
        Ok(())
    }

    #[tauri::command]
    pub fn cancel_download() -> Result<(), String> {
        use std::sync::atomic::Ordering;
        DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
        Ok(())
    }

    #[tauri::command]
    pub fn check_tesseract() -> bool {
        super::find_tesseract().is_some()
    }

    #[tauri::command]
    pub fn install_tesseract(app: tauri::AppHandle) -> Result<(), String> {
        // 이미 설치된 경우 tessdata만 확인 후 즉시 성공 반환
        if super::find_tesseract().is_some() {
            if let Err(e) = super::install_tessdata(&app) {
                eprintln!("[ERROR] tessdata 설치 실패: {}", e);
            }
            use tauri::Emitter;
            let _ = app.emit("tesseract-install-progress", serde_json::json!({
                "step": "done", "message": "OCR 엔진 사용 가능"
            }));
            return Ok(());
        }

        std::thread::spawn(move || {
            super::run_tesseract_install(app);
        });

        Ok(())
    }
}

// ─── Tesseract 설치 헬퍼 ────────────────────────────────────────────────────

fn install_tessdata(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    let src = app.path().resource_dir()
        .map_err(|e| e.to_string())?
        .join("tessdata")
        .join("kor.traineddata");

    if !src.exists() {
        return Err("번들 tessdata 파일을 찾을 수 없습니다.".into());
    }

    // APPDATA\paperchat\tessdata — 관리자 권한 불필요
    let appdata = std::env::var("APPDATA")
        .map_err(|_| "APPDATA 환경변수 없음".to_string())?;
    let dst_dir = std::path::PathBuf::from(appdata)
        .join("paperchat")
        .join("tessdata");

    std::fs::create_dir_all(&dst_dir)
        .map_err(|e| format!("tessdata 폴더 생성 실패: {}", e))?;

    let dst = dst_dir.join("kor.traineddata");
    if !dst.exists() {
        std::fs::copy(&src, &dst)
            .map_err(|e| format!("tessdata 복사 실패: {}", e))?;
    }

    // 표준 Tesseract tessdata 폴더에도 복사 시도 (권한 있으면 성공)
    let standard = std::path::PathBuf::from(r"C:\Program Files\Tesseract-OCR\tessdata")
        .join("kor.traineddata");
    if !standard.exists() {
        let _ = std::fs::copy(&src, &standard);
    }

    Ok(())
}

fn run_tesseract_install(app: tauri::AppHandle) {
    use tauri::Emitter;

    let emit = |step: &str, message: &str| {
        let _ = app.emit("tesseract-install-progress", serde_json::json!({
            "step": step, "message": message
        }));
    };

    emit("installing", "Tesseract OCR 설치 중... (약 1-3분 소요)");
    log_info!("Tesseract 설치 시작");

    let output = hidden_cmd("winget")
        .args([
            "install", "--id", "UB-Mannheim.TesseractOCR",
            "-e", "--silent",
            "--accept-package-agreements",
            "--accept-source-agreements",
        ])
        .output();

    match output {
        Err(e) => {
            let msg = format!("winget 실행 실패: {}", e);
            log_error!("{}", msg);
            emit("error", &msg);
            return;
        }
        Ok(ref out) if !out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            let combined = format!("{}{}", stdout, stderr);
            // 이미 설치된 경우는 성공으로 처리
            if !combined.to_lowercase().contains("already installed") {
                let msg = format!("Tesseract 설치 실패: {}", stderr.trim());
                log_error!("{}", msg);
                emit("error", &msg);
                return;
            }
            log_info!("Tesseract 이미 설치됨 — tessdata만 복사");
        }
        _ => {
            log_info!("Tesseract winget 설치 완료");
        }
    }

    emit("tessdata", "한국어 언어 팩 설치 중...");

    if let Err(e) = install_tessdata(&app) {
        log_error!("tessdata 복사 실패: {}", e);
        emit("error", &format!("한국어 팩 설치 실패: {}", e));
        return;
    }

    log_info!("Tesseract 설치 완료");
    emit("done", "OCR 엔진 설치 완료");
}

// ─── 단위 테스트 ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wait_until_loaded_times_out_on_closed_port() {
        // 닫힌 포트 → 1초 타임아웃 → Err
        let result = wait_until_loaded(19999, 1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("초과"));
    }

    #[test]
    fn model_state_store_initial_is_idle() {
        let store = ModelStateStore::new();
        let state = store.get();
        assert!(matches!(state, ModelState::Idle { ram_gb: 0, .. }));
    }

    #[test]
    fn process_manager_shutdown_all_safe_when_empty() {
        let mut pm = ProcessManager::new();
        pm.shutdown_all(); // panic 없어야 함
    }

    #[test]
    fn process_manager_kill_llm_safe_when_empty() {
        let mut pm = ProcessManager::new();
        pm.kill_llm(); // panic 없어야 함
    }
}

// ─── Tauri 앱 진입점 ─────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            // Tauri State 등록
            app.manage(ProcessManagerState(Mutex::new(ProcessManager::new())));
            app.manage(ModelStateStore::new());

            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                use tauri::Manager;

                let data_dir = app_handle.path().app_local_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("./data"));

                {
                    let mut p = LOG_PATH.lock().unwrap();
                    *p = Some(data_dir.join("tauri.log"));
                }
                log_info!("paperchat 시작 — data_dir={}", data_dir.display());

                #[cfg(windows)]
                job::init();

                let proc_mgr_state = app_handle.state::<ProcessManagerState>();
                let model_store = app_handle.state::<ModelStateStore>();

                // 서버 기동
                let server_ok = proc_mgr_state.0.lock().unwrap().spawn_server(&data_dir).is_ok();
                if server_ok {
                    log_info!("paperchat-server 시작 완료");
                } else {
                    log_error!("paperchat-server 시작 실패 — backend 없이 계속");
                }

                // 하드웨어 감지 (모델 유무 관계없이 항상 먼저)
                let ram_gb = get_ram_gb();
                let (has_gpu, gpu_name, vram_gb) = get_gpu_info();
                let recommended = recommended_model(ram_gb, has_gpu, vram_gb);
                log_info!("하드웨어 감지 완료 — RAM={}GB, GPU={}", ram_gb, gpu_name);

                // 모델 존재 여부 확인
                let model_info = resolve_model(&data_dir);
                let has_model = model_info.is_some();

                if !has_model {
                    log_info!("모델 없음 → Idle");
                    model_store.set_and_emit(&app_handle, ModelState::Idle {
                        ram_gb,
                        gpu_name: gpu_name.clone(),
                        vram_gb,
                        recommended_filename: recommended.filename.to_string(),
                        all_models: MODELS.to_vec(),
                    });
                } else {
                    // 모델 있음 → 즉시 Loading emit으로 "시스템 확인 중..." 방지
                    log_info!("모델 발견 → Loading 상태 emit");
                    model_store.set_and_emit(&app_handle, ModelState::Loading);
                }

                // 창 표시
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // 모델 있을 때만 backend 포트 대기 후 llama-server 기동
                if has_model {
                    if wait_for_port(BACKEND_PORT, 60) {
                        log_info!("backend 포트 {} 준비 완료", BACKEND_PORT);
                    } else {
                        log_error!("backend 포트 {} 대기 시간 초과", BACKEND_PORT);
                    }

                    // 이미 외부에서 llama-server가 실행 중이면 스폰 건너뜀
                    if is_port_open(LLAMA_PORT) {
                        log_info!("llama-server 이미 실행 중 (포트 {}) → Ready", LLAMA_PORT);
                        model_store.set_and_emit(&app_handle, ModelState::Ready);
                    } else if let Some((ref model_path, n_gpu_layers)) = model_info {
                        log_info!("모델 발견: {}", model_path.display());
                        match proc_mgr_state.0.lock().unwrap().spawn_llm(model_path, n_gpu_layers) {
                            Err(e) => {
                                // llama-server 바이너리 없음 → Idle로 복귀 (모델 선택 화면)
                                log_error!("llama-server 시작 실패 (바이너리 없음?): {}", e);
                                model_store.set_and_emit(&app_handle, ModelState::Idle {
                                    ram_gb,
                                    gpu_name,
                                    vram_gb,
                                    recommended_filename: recommended.filename.to_string(),
                                    all_models: MODELS.to_vec(),
                                });
                            }
                            Ok(()) => {
                                // React가 리스너를 등록할 때까지 대기
                                std::thread::sleep(std::time::Duration::from_secs(2));

                                log_info!("모델 로딩 대기...");
                                model_store.set_and_emit(&app_handle, ModelState::Loading);
                                match wait_until_loaded(LLAMA_PORT, 60) {
                                    Ok(()) => {
                                        log_info!("모델 로딩 완료 → Ready");
                                        model_store.set_and_emit(&app_handle, ModelState::Ready);
                                    }
                                    Err(reason) => {
                                        log_error!("모델 로딩 실패: {}", reason);
                                        proc_mgr_state.0.lock().unwrap().kill_llm();
                                        model_store.set_and_emit(&app_handle, ModelState::Failed {
                                            reason: format!("{} — RAM/VRAM 부족 가능성", reason),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backend_status,
            commands::get_model_state,
            commands::get_model_status,
            commands::stop_all_sidecars,
            commands::close_app,
            commands::pick_pdf_files,
            commands::read_logs,
            commands::install_model,
            commands::cancel_download,
            commands::check_tesseract,
            commands::install_tesseract,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                use tauri::Manager;
                let handle = window.app_handle().clone();
                std::thread::spawn(move || {
                    use tauri::Manager;
                    handle.state::<ProcessManagerState>().0.lock().unwrap().shutdown_all();
                    handle.exit(0);
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
