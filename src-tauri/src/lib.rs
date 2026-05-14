use tauri::Manager;

const RESOURCES_ZIP: &[u8] = include_bytes!("../resources.zip");

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

fn extract_zip(zip_bytes: &[u8], target_dir: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    use std::fs;
    use std::io::Cursor;

    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }

    Ok(())
}

struct ChildState {
    child: std::sync::Mutex<Option<std::process::Child>>,
    temp_dir: Option<std::path::PathBuf>,
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
            use tauri_plugin_dialog::DialogExt;

            let mut temp_dir_to_store = None;

            let backend_dir = match find_backend_dir() {
                Some(dir) => dir,
                None => {
                    // Portable/Standalone mode: Extract zipped server files to OS temporary directory
                    let temp_path = std::env::temp_dir().join("belt-mod-manager-runtime");
                    if temp_path.exists() {
                        let _ = std::fs::remove_dir_all(&temp_path);
                    }
                    if let Err(e) = extract_zip(RESOURCES_ZIP, &temp_path) {
                        app.dialog()
                            .message(&format!("Critical Error:\nFailed to unpack embedded resource archive.\n\nDetails: {}", e))
                            .title("Belt Mod Manager - Extraction Failed")
                            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                            .blocking_show();
                        return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, "Extraction failure")));
                    }
                    temp_dir_to_store = Some(temp_path.clone());
                    temp_path
                }
            };

            let mut cmd = Command::new("node");
            cmd.arg("backend/server.js")
               .stdout(Stdio::piped())
               .stderr(Stdio::piped())
               .current_dir(backend_dir);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(_) => {
                    app.dialog()
                        .message("Critical Error:\nFailed to spawn the background Node.js server.\n\nPlease make sure that Node.js is installed on this computer and added to your system PATH.")
                        .title("Belt Mod Manager - Startup Failed")
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .blocking_show();
                    return Err(Box::new(std::io::Error::new(std::io::ErrorKind::Other, "Failed to spawn Node.js server")));
                }
            };

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
                                        .inner_size(750.0, 840.0)
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
                temp_dir: temp_dir_to_store,
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
                    if let Some(ref temp_path) = state.temp_dir {
                        let _ = std::fs::remove_dir_all(temp_path);
                    }
                }
            }
        });
}
