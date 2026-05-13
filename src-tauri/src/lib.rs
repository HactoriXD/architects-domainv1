use std::{
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;

struct BridgeProcess(Mutex<Option<Child>>);

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(BridgeProcess(Mutex::new(start_bridge_if_needed())));
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(state) = window.app_handle().try_state::<BridgeProcess>() {
                    if let Ok(mut bridge) = state.0.lock() {
                        if let Some(child) = bridge.as_mut() {
                            let _ = child.kill();
                        }
                        *bridge = None;
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Architect's Domain");
}

fn start_bridge_if_needed() -> Option<Child> {
    if bridge_port_is_open() {
        return None;
    }

    let root = find_project_root()?;
    let server = root.join("server.js");
    if !server.is_file() {
        eprintln!("Architect's Domain bridge server not found at {}", server.display());
        return None;
    }

    let mut command = Command::new("node");
    command
        .arg(server)
        .current_dir(root)
        .env("PORT", "3000")
        .env("ARCHITECTS_DOMAIN_DESKTOP", "1");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    match command.spawn() {
        Ok(child) => Some(child),
        Err(error) => {
            eprintln!("Failed to start Architect's Domain bridge: {error}");
            None
        }
    }
}

fn bridge_port_is_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn find_project_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    for candidate in candidates {
        if let Some(root) = find_ancestor_with_server(&candidate) {
            return Some(root);
        }
    }

    None
}

fn find_ancestor_with_server(start: &Path) -> Option<PathBuf> {
    for dir in start.ancestors() {
        if dir.join("server.js").is_file() && dir.join("bridge").is_dir() {
            return Some(dir.to_path_buf());
        }
    }
    None
}
