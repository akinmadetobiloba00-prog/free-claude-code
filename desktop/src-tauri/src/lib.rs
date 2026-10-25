// SPDX-License-Identifier: AGPL-3.0-only
//! FCC Desk native shell: window, tray, and the local fcc-server lifecycle.

mod proxy;

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::sync::atomic::Ordering;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[derive(Serialize)]
struct ServerState {
    running: bool,
    started_by_desk: bool,
    message: String,
}

/// True when FCC answers GET /health on 127.0.0.1:<port>.
fn health(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(600)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf.starts_with("HTTP/1.1 200") && buf.contains("healthy")
}

/// Candidate paths for the fcc-server launcher installed by the FCC installer (uv tool).
fn server_candidates() -> Vec<PathBuf> {
    let exe = if cfg!(windows) { "fcc-server.exe" } else { "fcc-server" };
    let mut out = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            out.push(dir.join(exe));
        }
    }
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    if let Some(h) = home {
        out.push(h.join(".local").join("bin").join(exe));
    }
    if let Some(bin) = std::env::var_os("UV_TOOL_BIN_DIR") {
        out.push(PathBuf::from(bin).join(exe));
    }
    out
}

fn find_server() -> Option<PathBuf> {
    server_candidates().into_iter().find(|p| p.is_file())
}


#[tauri::command]
fn server_status(port: u16) -> ServerState {
    let running = health(port);
    ServerState { running, started_by_desk: false, message: if running { "FCC is running".into() } else { "FCC is not running".into() } }
}

/// Start fcc-server in the background when it is not already running, then wait for /health.
#[tauri::command]
async fn ensure_server(port: u16) -> Result<ServerState, String> {
    proxy::FCC_PORT.store(port, Ordering::Relaxed);
    if health(port) {
        return Ok(ServerState { running: true, started_by_desk: false, message: "FCC is running".into() });
    }
    let Some(exe) = find_server() else {
        return Err("Could not find fcc-server. Install Free Claude Code first, then reopen FCC Desk.".into());
    };
    let mut cmd = Command::new(&exe);
    cmd.arg("--auto-started")
        .env("FCC_OPEN_BROWSER", "false")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
    cmd.spawn().map_err(|e| format!("Could not start fcc-server: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(45);
    while Instant::now() < deadline {
        if health(port) {
            return Ok(ServerState { running: true, started_by_desk: true, message: "Started FCC".into() });
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("fcc-server started but did not answer in 45 seconds. Run fcc-doctor in a terminal.".into())
}

fn find_bin(name: &str) -> Option<PathBuf> {
    let exts: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ".bat", ""] } else { &[""] };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(h) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        dirs.push(PathBuf::from(h).join(".local").join("bin"));
    }
    for d in dirs {
        for e in exts {
            let p = d.join(format!("{name}{e}"));
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[derive(Serialize)]
struct Harness {
    launcher: String,
    binary: String,
    launcher_found: bool,
    binary_found: bool,
}

/// Report which fcc-* launchers and their native harness binaries are installed.
#[tauri::command]
fn list_harnesses(pairs: Vec<(String, String)>) -> Vec<Harness> {
    pairs
        .into_iter()
        .map(|(launcher, binary)| Harness {
            launcher_found: find_bin(&launcher).is_some(),
            binary_found: find_bin(&binary).is_some(),
            launcher,
            binary,
        })
        .collect()
}

const ALLOWED: &[&str] = &[
    "fcc-claude", "fcc-codex", "fcc-opencode", "fcc-cline", "fcc-aider", "fcc-grok", "fcc-pi",
    "fcc-hermes", "fcc-dsh", "fcc-muse", "fcc-agy", "fcc-doctor", "fcc-update", "fcc-server",
];

/// Open a new system terminal window running an fcc-* command in `cwd`.
/// The terminal is the same CLI users already know, so nothing about the CLI changes.
#[tauri::command]
fn launch_in_terminal(command: String, cwd: Option<String>) -> Result<(), String> {
    if !ALLOWED.contains(&command.as_str()) {
        return Err("Unknown command".into());
    }
    let exe = find_bin(&command).ok_or_else(|| format!("{command} is not installed or not on PATH"))?;
    let dir = cwd.filter(|c| !c.is_empty()).map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let exe_s = exe.to_string_lossy().to_string();
    #[cfg(windows)]
    let res = Command::new("cmd").args(["/C", "start", "FCC", "cmd", "/K", &exe_s]).current_dir(&dir).spawn();
    #[cfg(target_os = "macos")]
    let res = Command::new("osascript")
        .args(["-e", &format!("tell application \"Terminal\" to do script \"cd '{}' && '{}'\"", dir.display(), exe_s)])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let res = {
        let script = format!("cd '{}' && '{}'; exec $SHELL", dir.display(), exe_s);
        ["x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"]
            .iter()
            .find_map(|t| find_bin(t).map(|p| (t.to_string(), p)))
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no terminal emulator found"))
            .and_then(|(t, p)| {
                let mut c = Command::new(p);
                if t == "gnome-terminal" { c.args(["--", "sh", "-c", &script]); } else { c.args(["-e", "sh", "-c", &script]); }
                c.spawn()
            })
    };
    res.map(|_| ()).map_err(|e| format!("Could not open a terminal: {e}"))
}

/// Run a short, read-only FCC command and return its output (fcc-doctor, fcc-server --version).
#[tauri::command]
async fn run_capture(command: String) -> Result<String, String> {
    let (bin, args): (&str, &[&str]) = match command.as_str() {
        "version" => ("fcc-server", &["--version"]),
        "doctor" => ("fcc-doctor", &[]),
        _ => return Err("Unknown command".into()),
    };
    let exe = find_bin(bin).ok_or_else(|| format!("{bin} not found"))?;
    let mut cmd = Command::new(exe);
    cmd.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    Ok(format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr)))
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![server_status, ensure_server, list_harnesses, launch_in_terminal, run_capture])
        .setup(|app| {
            // Debug builds load the Vite dev server (which proxies the API itself).
            // Release builds load the UI from the same-origin loopback bridge in proxy.rs.
            let url = if cfg!(debug_assertions) {
                WebviewUrl::App("index.html".into())
            } else {
                let port = tauri::async_runtime::block_on(proxy::serve(app.handle().clone()))?;
                WebviewUrl::External(format!("http://127.0.0.1:{port}/").parse().expect("bridge url"))
            };
            WebviewWindowBuilder::new(app, "main", url)
                .title("FCC Desk")
                .inner_size(1280.0, 820.0)
                .min_inner_size(760.0, 520.0)
                .background_color(tauri::window::Color(21, 21, 20, 255))
                .build()?;
            let open = MenuItem::with_id(app, "open", "Open FCC Desk", true, None::<&str>)?;
            let admin = MenuItem::with_id(app, "admin", "Open full Admin in browser", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit FCC Desk", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &admin, &quit])?;
            TrayIconBuilder::with_id("fcc-desk")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("FCC Desk")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "admin" => {
                        use tauri_plugin_opener::OpenerExt;
                        let port = proxy::FCC_PORT.load(Ordering::Relaxed);
                        let _ = app.opener().open_url(format!("http://127.0.0.1:{port}/admin"), None::<&str>);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it to the tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running FCC Desk");
}
