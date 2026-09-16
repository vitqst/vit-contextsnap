#[cfg(target_os = "linux")]
mod activation;
mod capture;
mod clipboard;
mod image_io;
#[cfg(target_os = "linux")]
mod ime;
mod lifecycle;
mod png;

use std::{
    io::Write,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct CaptureState(AtomicBool);

struct CaptureGuard<'a> {
    active: &'a AtomicBool,
    window: WebviewWindow,
}

impl Drop for CaptureGuard<'_> {
    fn drop(&mut self) {
        // Also runs when the native picker is cancelled or a worker returns an error.
        if let Err(error) = lifecycle::show_editor(&self.window) {
            eprintln!("Could not restore the editor after capture: {error}");
        }
        self.active.store(false, Ordering::Release);
    }
}

#[tauri::command]
fn quit_app(app: AppHandle, state: State<'_, CaptureState>) -> Result<(), String> {
    if state.0.load(Ordering::Acquire) {
        return Err("Finish or cancel the screen capture before quitting.".into());
    }
    // Only called after the renderer has confirmed any unsaved work.
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn capture_screenshot(
    window: WebviewWindow,
    state: State<'_, CaptureState>,
) -> Result<tauri::ipc::Response, String> {
    if state
        .0
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A screen capture is already in progress.".into());
    }
    let guard = CaptureGuard {
        active: &state.0,
        window,
    };
    let compositor_delay = lifecycle::prepare_capture(
        &guard.window.state::<lifecycle::TrayState>(),
        || guard.window.is_visible(),
        || guard.window.hide(),
    )
    .map_err(|error| format!("Could not hide the editor: {error}"))?;
    // Only wait for the compositor when this capture had to hide the editor.
    if !compositor_delay.is_zero() {
        tokio::time::sleep(compositor_delay).await;
    }
    capture::screenshot().await.map(tauri::ipc::Response::new)
}

#[tauri::command]
async fn read_clipboard_png(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    // The native clipboard may request data from our own webview. Never block
    // the UI thread while reading it, or WebKit and the clipboard can deadlock.
    tauri::async_runtime::spawn_blocking(move || clipboard::png(app.clipboard().read_image()))
        .await
        .map_err(|error| format!("Clipboard worker failed: {error}"))?
        .map(tauri::ipc::Response::new)
}

#[tauri::command]
async fn copy_png(app: AppHandle, png: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let image = image_io::decode_png(&png)?;
        let (width, height) = image.dimensions();
        app.clipboard()
            .write_image(&tauri::image::Image::new_owned(
                image.into_raw(),
                width,
                height,
            ))
            .map_err(|error| format!("Could not copy image: {error}"))
    })
    .await
    .map_err(|error| format!("Clipboard worker failed: {error}"))?
}

#[tauri::command]
async fn save_png(
    app: AppHandle,
    window: WebviewWindow,
    png: Vec<u8>,
    filename: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_io::decode_png(&png)?;
        // The renderer supplies only a suggested basename; only the native dialog chooses a path.
        let filename = Path::new(&filename)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty() && !name.contains('\0'))
            .unwrap_or("contextsnap.png");
        let Some(destination) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Save screenshot")
            .add_filter("PNG image", &["png"])
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let destination = destination
            .into_path()
            .map_err(|error| format!("Invalid save location: {error}"))?;
        let parent = destination
            .parent()
            .ok_or("Save location has no parent directory.")?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|error| format!("Could not create saved image: {error}"))?;
        temporary
            .write_all(&png)
            .and_then(|()| temporary.as_file().sync_all())
            .map_err(|error| format!("Could not save image: {error}"))?;
        temporary
            .persist(&destination)
            .map_err(|error| format!("Could not finish saving image: {error}"))?;
        Ok(true)
    })
    .await
    .map_err(|error| format!("Save worker failed: {error}"))?
}

pub fn run() {
    tauri::Builder::default()
        .manage(CaptureState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let created = match lifecycle::install_tray(app) {
                Ok(()) => true,
                Err(error) => {
                    eprintln!("Could not create system tray; closing will minimize: {error}");
                    false
                }
            };
            app.manage(lifecycle::TrayState::new(created));
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                // Runs on the UI thread, after Wry has applied its default settings.
                window.with_webview(|webview| ime::enable_inline_preedit(&webview.inner()))?;
            }
            if cfg!(target_os = "macos") {
                install_macos_menu(app)?;
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            lifecycle::handle_menu(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // X is a hide action: preserve the webview and its unsaved document.
                    api.prevent_close();
                    lifecycle::hide_to_tray(window);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            capture_screenshot,
            read_clipboard_png,
            copy_png,
            save_png,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run ContextSnap Desktop");
}

fn install_macos_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let quit = MenuItem::with_id(
        app,
        "quit",
        "Quit ContextSnap Desktop",
        true,
        Some("CmdOrCtrl+Q"),
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "ContextSnap Desktop",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About ContextSnap Desktop"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &quit,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
        ],
    )?;
    app.set_menu(menu)?;
    Ok(())
}
