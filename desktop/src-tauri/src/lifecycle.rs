use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewWindow, Window,
};

use crate::CaptureState;

pub struct TrayState {
    pub created: bool,
    close_generation: AtomicU64,
}

impl TrayState {
    pub fn new(created: bool) -> Self {
        Self {
            created,
            close_generation: AtomicU64::new(0),
        }
    }

    fn begin_close(&self) -> u64 {
        self.close_generation.fetch_add(1, Ordering::AcqRel) + 1
    }

    fn cancel_pending_close(&self) {
        self.close_generation.fetch_add(1, Ordering::AcqRel);
    }

    fn is_current_close(&self, generation: u64) -> bool {
        self.close_generation.load(Ordering::Acquire) == generation
    }
}

#[derive(Debug, PartialEq)]
enum MenuAction {
    Capture,
    Open,
    Quit,
}

fn menu_action(id: &str, capture_active: bool) -> Option<MenuAction> {
    // Reopening the editor while a picker is active would put it in the screenshot.
    if capture_active {
        return None;
    }
    match id {
        "screenshot" => Some(MenuAction::Capture),
        "open-editor" => Some(MenuAction::Open),
        "quit" => Some(MenuAction::Quit),
        _ => None,
    }
}

#[derive(Debug, PartialEq)]
enum CloseAction {
    Hide,
    Minimize,
}

fn close_action(tray_created: bool, host_available: bool) -> CloseAction {
    if tray_created && host_available {
        CloseAction::Hide
    } else {
        CloseAction::Minimize
    }
}

pub fn show_editor(window: &WebviewWindow) -> tauri::Result<()> {
    window.state::<TrayState>().cancel_pending_close();
    // Show first so a failure to focus cannot leave the editor inaccessible.
    window.show()?;
    window.unminimize()?;
    window.set_focus()
}

fn dispatch_menu<E>(
    action: MenuAction,
    tray: &TrayState,
    mut show: impl FnMut() -> Result<(), E>,
    emit: impl FnOnce(&str) -> Result<(), E>,
) -> Result<(), E> {
    if action == MenuAction::Capture {
        // The hidden webview can receive events. Do not flash the old document
        // before capture hides it again, and invalidate any in-flight close check.
        tray.cancel_pending_close();
    } else {
        show()?;
    }
    let event = match action {
        MenuAction::Capture => "contextsnap:capture-requested",
        MenuAction::Quit => "contextsnap:quit-requested",
        MenuAction::Open => return Ok(()),
    };
    if let Err(error) = emit(event) {
        if action == MenuAction::Capture {
            // A failed event cannot start the capture guard that normally restores
            // the editor. Keep the existing window accessible for retry instead.
            show()?;
        }
        return Err(error);
    }
    Ok(())
}

pub fn prepare_capture<E>(
    tray: &TrayState,
    visible: impl FnOnce() -> Result<bool, E>,
    hide: impl FnOnce() -> Result<(), E>,
) -> Result<Duration, E> {
    tray.cancel_pending_close();
    // Unknown visibility is handled conservatively: hide and wait rather than
    // risk including the editor itself in the screenshot.
    if !visible().unwrap_or(true) {
        return Ok(Duration::ZERO);
    }
    hide()?;
    Ok(Duration::from_millis(250))
}

pub fn handle_menu(app: &AppHandle, id: &str) {
    let capture_active = app.state::<CaptureState>().0.load(Ordering::Acquire);
    let Some(action) = menu_action(id, capture_active) else {
        return;
    };
    let Some(window) = app.get_webview_window("main") else {
        eprintln!("Cannot handle desktop menu action: editor window is unavailable.");
        return;
    };
    if let Err(error) = dispatch_menu(
        action,
        &window.state::<TrayState>(),
        || show_editor(&window),
        |event| window.emit(event, ()),
    ) {
        eprintln!("Could not send desktop menu action: {error}");
    }
}

pub fn install_tray(app: &tauri::App) -> tauri::Result<()> {
    let capture = MenuItem::with_id(app, "screenshot", "Screenshot", true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open-editor", "Open editor", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit ContextSnap", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&capture, &open, &PredefinedMenuItem::separator(app)?, &quit],
    )?;
    let mut tray = TrayIconBuilder::with_id("contextsnap")
        .tooltip("ContextSnap Desktop")
        .menu(&menu)
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    // Tauri retains the icon in its resource table until the application exits.
    tray.build(app)?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn tray_host_available() -> bool {
    // Creating an AppIndicator succeeds even without a panel extension to display it.
    // Recheck on every close: the user may enable/disable the extension at runtime.
    let query = async {
        let connection = zbus::Connection::session().await.ok()?;
        let proxy = zbus::Proxy::new(
            &connection,
            "org.kde.StatusNotifierWatcher",
            "/StatusNotifierWatcher",
            "org.kde.StatusNotifierWatcher",
        )
        .await
        .ok()?;
        proxy
            .get_property::<bool>("IsStatusNotifierHostRegistered")
            .await
            .ok()
    };
    tokio::time::timeout(Duration::from_secs(1), query)
        .await
        .ok()
        .flatten()
        .unwrap_or(false)
}

#[cfg(not(target_os = "linux"))]
async fn tray_host_available() -> bool {
    true
}

pub fn hide_to_tray(window: &Window) {
    let generation = window.state::<TrayState>().begin_close();
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        let created = window.state::<TrayState>().created;
        let action = close_action(created, created && tray_host_available().await);
        let target = window.clone();
        // Serialize the decision with menu actions; an older async host check must not
        // hide a window that the user has since reopened or begun capturing from.
        if let Err(error) = window.run_on_main_thread(move || {
            if !target.state::<TrayState>().is_current_close(generation)
                || target.state::<CaptureState>().0.load(Ordering::Acquire)
            {
                return;
            }
            match action {
                CloseAction::Hide => {
                    if let Err(error) = target.hide() {
                        eprintln!("Could not hide editor to tray: {error}");
                        if let Err(error) = target.minimize() {
                            eprintln!("Could not minimize editor: {error}");
                        }
                    }
                }
                CloseAction::Minimize => {
                    // Keep a taskbar/dock entry when no working tray host is available.
                    if let Err(error) = target.minimize() {
                        eprintln!("Could not minimize editor: {error}");
                    }
                }
            }
        }) {
            eprintln!("Could not schedule editor close action: {error}");
        }
    });
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;

    #[test]
    fn tray_capture_dispatches_without_flashing_the_editor() {
        let state = TrayState::new(true);
        let events = RefCell::new(Vec::new());
        dispatch_menu(
            MenuAction::Capture,
            &state,
            || {
                events.borrow_mut().push("show".to_owned());
                Ok::<(), &str>(())
            },
            |event| {
                events.borrow_mut().push(event.to_owned());
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(*events.borrow(), ["contextsnap:capture-requested"]);
    }

    #[test]
    fn tray_capture_cancels_pending_close_before_dispatch() {
        let state = TrayState::new(true);
        let pending = state.begin_close();
        dispatch_menu(
            MenuAction::Capture,
            &state,
            || Ok::<(), &str>(()),
            |_| {
                assert!(!state.is_current_close(pending));
                Ok(())
            },
        )
        .unwrap();
    }

    #[test]
    fn failed_capture_dispatch_restores_the_same_editor() {
        let state = TrayState::new(true);
        let events = RefCell::new(Vec::new());
        let result = dispatch_menu(
            MenuAction::Capture,
            &state,
            || {
                events.borrow_mut().push("show");
                Ok(())
            },
            |_| {
                events.borrow_mut().push("emit");
                Err("delivery failed")
            },
        );
        assert_eq!(result, Err("delivery failed"));
        assert_eq!(*events.borrow(), ["emit", "show"]);
    }

    #[test]
    fn open_and_quit_still_reveal_the_editor_before_dispatch() {
        for action in [MenuAction::Open, MenuAction::Quit] {
            let state = TrayState::new(true);
            let events = RefCell::new(Vec::new());
            let quit = action == MenuAction::Quit;
            dispatch_menu(
                action,
                &state,
                || {
                    events.borrow_mut().push("show".to_owned());
                    Ok::<(), &str>(())
                },
                |event| {
                    events.borrow_mut().push(event.to_owned());
                    Ok(())
                },
            )
            .unwrap();
            assert_eq!(events.borrow()[0], "show");
            assert_eq!(events.borrow().len(), if quit { 2 } else { 1 });
            if quit {
                assert_eq!(events.borrow()[1], "contextsnap:quit-requested");
            }
        }
    }

    #[test]
    fn hidden_editor_needs_no_hide_or_compositor_delay() {
        let state = TrayState::new(true);
        let hidden = Cell::new(false);
        let delay = prepare_capture(
            &state,
            || Ok::<bool, &str>(false),
            || {
                hidden.set(true);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(delay, Duration::ZERO);
        assert!(!hidden.get());
    }

    #[test]
    fn visible_or_unknown_editor_is_hidden_before_compositor_delay() {
        for visible in [Ok(true), Err("visibility unavailable")] {
            let state = TrayState::new(true);
            let hidden = Cell::new(false);
            let delay = prepare_capture(
                &state,
                || visible,
                || {
                    hidden.set(true);
                    Ok(())
                },
            )
            .unwrap();
            assert!(hidden.get());
            assert_eq!(delay, Duration::from_millis(250));
        }
    }

    #[test]
    fn preparing_capture_cancels_pending_close_even_if_hiding_fails() {
        let state = TrayState::new(true);
        let pending = state.begin_close();
        let result = prepare_capture(&state, || Ok(true), || Err("hide failed"));
        assert_eq!(result, Err("hide failed"));
        assert!(!state.is_current_close(pending));
    }

    #[test]
    fn recognized_menu_items_route_to_editor_actions() {
        assert_eq!(menu_action("screenshot", false), Some(MenuAction::Capture));
        assert_eq!(menu_action("open-editor", false), Some(MenuAction::Open));
        assert_eq!(menu_action("quit", false), Some(MenuAction::Quit));
        assert_eq!(menu_action("unrelated", false), None);
    }

    #[test]
    fn menu_actions_cannot_reveal_the_editor_during_a_capture() {
        for id in ["screenshot", "open-editor", "quit"] {
            assert_eq!(menu_action(id, true), None);
        }
    }

    #[test]
    fn close_requires_a_usable_tray_before_hiding() {
        assert_eq!(close_action(true, true), CloseAction::Hide);
        assert_eq!(close_action(false, true), CloseAction::Minimize);
        assert_eq!(close_action(true, false), CloseAction::Minimize);
        assert_eq!(close_action(false, false), CloseAction::Minimize);
    }

    #[test]
    fn opening_editor_cancels_pending_close_while_tray_host_is_checked() {
        let state = TrayState::new(true);
        let pending = state.begin_close();
        assert!(state.is_current_close(pending));
        state.cancel_pending_close();
        assert!(!state.is_current_close(pending));
    }

    #[test]
    fn only_the_latest_pending_close_can_hide_the_editor() {
        let state = TrayState::new(true);
        let older = state.begin_close();
        let newer = state.begin_close();
        assert!(!state.is_current_close(older));
        assert!(state.is_current_close(newer));
    }
}
