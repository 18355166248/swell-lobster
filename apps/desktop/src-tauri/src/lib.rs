use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

/// 全局持有 tide-lobster sidecar 进程句柄，用于应用退出时清理。
struct SidecarState(Mutex<Option<CommandChild>>);

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

/// 启动 tide-lobster sidecar，将 stdout/stderr 写入日志文件。
fn start_tide_lobster(app: &AppHandle) -> Result<CommandChild, String> {
    let output_dir = resolve_output_dir(app);
    std::fs::create_dir_all(&output_dir).ok();

    let log_path = resolve_log_path(app);
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let (mut rx, child) = app
        .shell()
        .sidecar("binaries/tide-lobster")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?
        .env("SWELL_OUTPUT_DIR", output_dir.to_string_lossy().as_ref())
        .env("API_HOST", "127.0.0.1")
        .env("API_PORT", "18900")
        .spawn()
        .map_err(|e| format!("Failed to start tide-lobster: {e}"))?;

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
                                eprintln!(
                                    "[desktop] tide-lobster failed to start within 10s. Log: {}",
                                    log_path.display()
                                );
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[desktop] sidecar start error: {e}");
                        // 写入错误到日志
                        let log_path = resolve_log_path(&app_handle);
                        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                            let _ = writeln!(f, "[SIDECAR START ERROR] {e}");
                        }
                    }
                }
            }

            #[cfg(debug_assertions)]
            let _ = app_handle;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<SidecarState>();
                if let Some(child) = state.0.lock().unwrap().take() {
                    let _ = child.kill();
                };
            }
        })
        .invoke_handler(tauri::generate_handler![open_file, get_output_dir, get_log_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
