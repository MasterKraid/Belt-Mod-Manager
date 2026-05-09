use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn find_backend_dir() -> Option<std::path::PathBuf> {
    // 1. Check current working directory first
    if std::path::Path::new("backend/server.js").exists() {
        return Some(std::path::PathBuf::from("."));
    }

    // 2. Climb up from current executable to find the project root containing backend/server.js
    if let Ok(exe_path) = std::env::current_exe() {
        let mut dir = exe_path.parent();
        while let Some(path) = dir {
            if path.join("backend/server.js").exists() {
                return Some(path.to_path_buf());
            }
            dir = path.parent();
        }
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let shell = app.shell();
            // Spawns "node backend/server.js" in the background with dynamically resolved working directory
            let mut cmd = shell.command("node")
                .args(["backend/server.js"]);

            if let Some(backend_dir) = find_backend_dir() {
                cmd = cmd.current_dir(backend_dir);
            }

            let (mut rx, _child) = cmd.spawn()
                .expect("failed to spawn node server");

            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line_bytes) = event {
                        let line = String::from_utf8_lossy(&line_bytes);
                        println!("{}", line);
                        
                        // Dynamically detect which random ephemeral port the server selected
                        if let Some(pos) = line.find("on port ") {
                            let port_str = &line[pos + 8..].trim();
                            let port_num_str: String = port_str.chars().take_while(|c| c.is_ascii_digit()).collect();
                            if let Ok(port) = port_num_str.parse::<u16>() {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let url = format!("http://localhost:{}", port).parse().unwrap();
                                    let _ = window.navigate(url);
                                }
                            }
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
