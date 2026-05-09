use tauri::Manager;

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

struct ChildState {
    child: std::sync::Mutex<Option<std::process::Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use std::io::{BufRead, BufReader};
            use std::process::{Command, Stdio};

            let mut cmd = Command::new("node");
            cmd.arg("backend/server.js")
               .stdout(Stdio::piped())
               .stderr(Stdio::piped());

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            if let Some(backend_dir) = find_backend_dir() {
                cmd.current_dir(backend_dir);
            }

            let mut child = cmd.spawn().expect("failed to spawn node server");
            let stdout = child.stdout.take().expect("failed to get stdout");

            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line_result in reader.lines() {
                    if let Ok(line) = line_result {
                        println!("{}", line);
                        if let Some(pos) = line.find("on port ") {
                            let port_str = &line[pos + 8..].trim();
                            let port_num_str: String = port_str.chars().take_while(|c| c.is_ascii_digit()).collect();
                            if let Ok(port) = port_num_str.parse::<u16>() {
                                if app_handle.get_webview_window("main").is_none() {
                                    let url = format!("http://localhost:{}", port);
                                    let handle_for_thread = app_handle.clone();
                                    let _ = app_handle.run_on_main_thread(move || {
                                        if let Ok(window) = tauri::WebviewWindowBuilder::new(
                                            &handle_for_thread,
                                            "main",
                                            tauri::WebviewUrl::External(url.parse().unwrap())
                                        )
                                        .title("Belt Mod Manager")
                                        .inner_size(720.0, 840.0)
                                        .resizable(false)
                                        .transparent(true)
                                        .decorations(false)
                                        .shadow(false)
                                        .build() {
                                            let _ = window.center();
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            });

            app.manage(ChildState {
                child: std::sync::Mutex::new(Some(child)),
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ChildState>() {
                    if let Ok(mut lock) = state.child.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
