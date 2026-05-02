use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

/// 全局持有 tide-lobster sidecar 进程句柄，用于应用退出时清理。
struct SidecarState(Mutex<Option<CommandChild>>);

/// 从 Windows 注册表读取系统代理地址（Clash 等工具写入）。
/// 仅当 ProxyEnable=1 且 ProxyServer 不为空时返回 `http://<server>`。
#[cfg(windows)]
#[cfg_attr(debug_assertions, allow(dead_code))]
fn detect_windows_system_proxy() -> Option<String> {
    let key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    let enabled = std::process::Command::new("reg")
        .args(["query", key, "/v", "ProxyEnable"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.lines()
                .find(|l| l.contains("ProxyEnable"))
                .and_then(|l| l.split_whitespace().last().map(|v| v != "0x0"))
        })
        .unwrap_or(false);

    if !enabled {
        return None;
    }

    std::process::Command::new("reg")
        .args(["query", key, "/v", "ProxyServer"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            s.lines()
                .find(|l| l.contains("ProxyServer"))
                .and_then(|l| l.split_whitespace().last().map(|v| v.to_string()))
        })
        .map(|server| {
            if server.starts_with("http") {
                server
            } else {
                format!("http://{server}")
            }
        })
}

/// 打开文件（用系统默认程序）。
#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open file: {e}"))
}

/// 返回当前 OUTPUT_DIR 路径。
#[tauri::command]
fn get_output_dir(app: AppHandle) -> String {
    resolve_output_dir(&app).to_string_lossy().to_string()
}

/// 返回 tide-lobster 日志文件路径，前端可用于「查看日志」功能。
#[tauri::command]
fn get_log_path(app: AppHandle) -> String {
    resolve_log_path(&app).to_string_lossy().to_string()
}

/// 打开 WebView 开发者工具（仅 devtools feature 启用时有效）。
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

fn resolve_output_dir(app: &AppHandle) -> PathBuf {
    if let Ok(custom) = std::env::var("SWELL_OUTPUT_DIR") {
        return PathBuf::from(custom);
    }
    app.path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("SwellLobster")
        .join("outputs")
}

fn resolve_log_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_log_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join("tide-lobster.log")
}

fn resolve_global_env_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".swell-lobster")
}

fn append_diag_log(log_path: &PathBuf, line: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{line}");
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn current_target_triple() -> &'static str {
    "aarch64-apple-darwin"
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn current_target_triple() -> &'static str {
    "x86_64-apple-darwin"
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn current_target_triple() -> &'static str {
    "x86_64-unknown-linux-gnu"
}

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
fn current_target_triple() -> &'static str {
    "aarch64-unknown-linux-gnu"
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn current_target_triple() -> &'static str {
    "x86_64-pc-windows-msvc"
}

#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "aarch64"),
    all(target_os = "windows", target_arch = "x86_64")
)))]
fn current_target_triple() -> &'static str {
    "unknown"
}

fn find_existing_path(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.exists()).cloned()
}

fn executable_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
}

fn resolve_packaged_binary(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let triple = current_target_triple();
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource_dir: {e}"))?;

    let mut candidates = vec![
        resource_dir.join(format!("{name}{ext}")),
        resource_dir.join("binaries").join(format!("{name}-{triple}{ext}")),
    ];

    if let Some(exe_dir) = executable_dir() {
        candidates.push(exe_dir.join(format!("{name}{ext}")));
    }

    find_existing_path(&candidates).ok_or_else(|| {
        format!(
            "Cannot resolve packaged binary `{name}`. Tried: {}",
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    })
}

async fn request_backend_shutdown() {
    let client = reqwest::Client::new();
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        client.post("http://127.0.0.1:18900/api/shutdown").send(),
    )
    .await;
}

/// 启动 tide-lobster sidecar，将 stdout/stderr 写入日志文件。
#[cfg_attr(debug_assertions, allow(dead_code))]
fn start_tide_lobster(app: &AppHandle) -> Result<CommandChild, String> {
    let output_dir = resolve_output_dir(app);
    std::fs::create_dir_all(&output_dir).ok();

    let log_path = resolve_log_path(app);
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let global_env_dir = resolve_global_env_dir(app);
    std::fs::create_dir_all(&global_env_dir).ok();
    append_diag_log(
        &log_path,
        &format!("[config] global env dir = {}", global_env_dir.display()),
    );
    append_diag_log(
        &log_path,
        &format!(
            "[config] global env file = {}",
            global_env_dir.join(".env").display()
        ),
    );

    // Tauri NSIS 安装后 externalBin 产物位于 resource_dir 根目录，且不含 target triple 后缀
    // （sidecar("binaries/tide-lobster") 会拼接 triple 导致 os error 2，故手动 resolve）
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource_dir: {e}"))?;
    let binary_path = resolve_packaged_binary(app, "tide-lobster")?;
    let sqlite_binding = resource_dir.join("binaries").join("better_sqlite3.node");
    let uv_path = resolve_packaged_binary(app, "uv")
        .unwrap_or_else(|_| resource_dir.join("binaries").join("uv"));

    if !sqlite_binding.exists() {
        append_diag_log(
            &log_path,
            &format!(
                "[diag] missing better_sqlite3 binding: {}",
                sqlite_binding.display()
            ),
        );
    }

    if !uv_path.exists() {
        append_diag_log(
            &log_path,
            &format!("[diag] missing uv binary: {}", uv_path.display()),
        );
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| resource_dir.join("data"));
    std::fs::create_dir_all(&data_dir).ok();

    // 同时创建 LocalAppData 目录，方便用户在两个位置都能放 .env（Local 优先）
    let local_data_dir = app.path().app_local_data_dir().ok();
    if let Some(ref d) = local_data_dir {
        std::fs::create_dir_all(d).ok();
    }

    // 透传系统代理环境变量，使 tide-lobster 的 fetchDispatcher 能正确走代理
    let proxy_vars = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                      "http_proxy", "https_proxy", "all_proxy", "no_proxy"];

    let mut cmd = app
        .shell()
        .command(&binary_path)
        .env("SWELL_PROJECT_ROOT", resource_dir.to_string_lossy().as_ref())
        .env("SWELL_DATA_DIR", data_dir.to_string_lossy().as_ref())
        .env("SWELL_LOCAL_DATA_DIR", local_data_dir.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default())
        .env("SWELL_GLOBAL_ENV_DIR", global_env_dir.to_string_lossy().as_ref())
        .env("SWELL_OUTPUT_DIR", output_dir.to_string_lossy().as_ref())
        .env("API_HOST", "127.0.0.1")
        .env("API_PORT", "18900")
        .env("BETTER_SQLITE3_BINDING", sqlite_binding.to_string_lossy().as_ref())
        .env("SWELL_UV_BIN", uv_path.to_string_lossy().as_ref());

    for var in &proxy_vars {
        if let Ok(val) = std::env::var(var) {
            cmd = cmd.env(var, val);
        }
    }

    // 若 env 里没有 proxy 变量，尝试读取 Windows 系统代理（Clash 等代理工具会写注册表）
    #[cfg(windows)]
    {
        let has_proxy = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]
            .iter()
            .any(|v| std::env::var(v).is_ok());
        if !has_proxy {
            if let Some(proxy_url) = detect_windows_system_proxy() {
                append_diag_log(&log_path, &format!("[diag] auto-detected windows proxy: {proxy_url}"));
                cmd = cmd.env("HTTPS_PROXY", &proxy_url).env("HTTP_PROXY", &proxy_url);
            }
        }
    }

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| {
            append_diag_log(&log_path, &format!("[diag] binary_path: {}", binary_path.display()));
            append_diag_log(&log_path, &format!("[diag] binary_exists: {}", binary_path.exists()));
            append_diag_log(&log_path, &format!("[diag] spawn error: {e}"));
            format!("Failed to start tide-lobster: {e}")
        })?;

    // 消费 stdout/stderr 并写入日志文件，防止管道缓冲区填满阻塞进程
    tauri::async_runtime::spawn(async move {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .ok();

        // 写入启动时间戳
        if let Some(f) = &mut file {
            let _ = writeln!(f, "\n--- tide-lobster started at {:?} ---", std::time::SystemTime::now());
        }

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    if let Some(f) = &mut file {
                        let _ = f.write_all(&line);
                        let _ = f.write_all(b"\n");
                    }
                }
                CommandEvent::Stderr(line) => {
                    if let Some(f) = &mut file {
                        let _ = write!(f, "[ERR] ");
                        let _ = f.write_all(&line);
                        let _ = f.write_all(b"\n");
                    }
                }
                CommandEvent::Error(e) => {
                    if let Some(f) = &mut file {
                        let _ = writeln!(f, "[PROCESS ERROR] {e}");
                    }
                }
                CommandEvent::Terminated(status) => {
                    if let Some(f) = &mut file {
                        let _ = writeln!(f, "[TERMINATED] code={:?}", status.code);
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

/// 轮询等待 tide-lobster 健康检查通过（最多 10 秒）。
#[cfg_attr(debug_assertions, allow(dead_code))]
async fn wait_for_backend() -> bool {
    let client = reqwest::Client::new();
    for _ in 0..20 {
        if client
            .get("http://127.0.0.1:18900/api/health")
            .send()
            .await
            .is_ok()
        {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    false
}

#[tauri::command]
async fn restart_backend(app: AppHandle, state: State<'_, SidecarState>) -> Result<(), String> {
    let log_path = resolve_log_path(&app);
    append_diag_log(&log_path, "[desktop] restart_backend requested");

    request_backend_shutdown().await;

    if let Some(child) = state.0.lock().unwrap().take() {
        let _ = child.kill();
    }

    let child = start_tide_lobster(&app)?;
    *state.0.lock().unwrap() = Some(child);

    if wait_for_backend().await {
        append_diag_log(&log_path, "[desktop] restart_backend succeeded");
        Ok(())
    } else {
        append_diag_log(&log_path, "[desktop] restart_backend failed health check within 10s");
        Err("Backend restarted but health check did not recover within 10s".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let app_handle = app.handle().clone();

            #[cfg(not(debug_assertions))]
            {
                match start_tide_lobster(&app_handle) {
                    Ok(child) => {
                        *app_handle.state::<SidecarState>().0.lock().unwrap() = Some(child);
                        let log_path = resolve_log_path(&app_handle);
                        tauri::async_runtime::spawn(async move {
                            if !wait_for_backend().await {
                                append_diag_log(
                                    &log_path,
                                    "[desktop] tide-lobster failed health check within 10s",
                                );
                                eprintln!(
                                    "[desktop] tide-lobster failed to start within 10s. Log: {}",
                                    log_path.display()
                                );
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[desktop] sidecar start error: {e}");
                        let log_path = resolve_log_path(&app_handle);
                        append_diag_log(&log_path, &format!("[SIDECAR START ERROR] {e}"));
                    }
                }
            }

            #[cfg(debug_assertions)]
            let _ = app_handle;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                let win = window.clone();
                tauri::async_runtime::spawn(async move {
                    // 先尝试优雅关闭 sidecar（最多等 3 秒）
                    request_backend_shutdown().await;
                    // 无论结果如何，强制 kill 残留进程
                    let state = app.state::<SidecarState>();
                    if let Some(child) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                    let _ = win.destroy();
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            get_output_dir,
            get_log_path,
            open_devtools,
            restart_backend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
