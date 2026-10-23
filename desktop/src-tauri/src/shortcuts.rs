use serde::{Deserialize, Serialize};
use std::{io::Write, sync::Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CaptureShortcuts {
    pub screenshot: String,
    pub copy: String,
    #[serde(skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for CaptureShortcuts {
    fn default() -> Self {
        Self {
            screenshot: "Ctrl+Shift+4".into(),
            copy: "Ctrl+Shift+Alt+4".into(),
            error: None,
        }
    }
}

fn parse(settings: &CaptureShortcuts) -> Result<Vec<Shortcut>, String> {
    let mut shortcuts = Vec::new();
    for value in [&settings.screenshot, &settings.copy] {
        if value.trim().is_empty() {
            continue;
        }
        let shortcut = value
            .trim()
            .parse::<Shortcut>()
            .map_err(|error| format!("Invalid shortcut '{value}': {error}"))?;
        if shortcut.mods.is_empty() {
            return Err("Use at least one modifier, such as Ctrl, Alt, Shift, or Super.".into());
        }
        if shortcuts.contains(&shortcut) {
            return Err("Screenshot and Screenshot & Copy must use different shortcuts.".into());
        }
        shortcuts.push(shortcut);
    }
    Ok(shortcuts)
}

#[derive(Default)]
pub struct ShortcutState {
    settings: CaptureShortcuts,
    active: Vec<Shortcut>,
}

pub struct Shortcuts(pub Mutex<ShortcutState>);

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|path| path.join("capture-shortcuts.json"))
        .map_err(|error| format!("Could not locate shortcut settings: {error}"))
}

fn persist(app: &AppHandle, settings: &CaptureShortcuts) -> Result<(), String> {
    let path = settings_path(app)?;
    let parent = path.parent().ok_or("Missing settings directory")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    let json = serde_json::to_vec(settings).map_err(|error| error.to_string())?;
    file.write_all(&json)
        .and_then(|()| file.as_file().sync_all())
        .map_err(|error| error.to_string())?;
    file.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn install(app: &AppHandle) {
    let loaded = settings_path(app).and_then(|path| match std::fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice::<CaptureShortcuts>(&bytes).map_err(|error| error.to_string())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(CaptureShortcuts::default())
        }
        Err(error) => Err(error.to_string()),
    });
    let mut state = ShortcutState::default();
    match loaded {
        Ok(settings) => state.settings = settings,
        Err(error) => state.settings.error = Some(format!("Could not load shortcuts: {error}")),
    }
    match parse(&state.settings) {
        Ok(keys) => {
            for key in keys {
                match app.global_shortcut().register(key) {
                Ok(()) => state.active.push(key),
                Err(error) => state.settings.error = Some(format!("Could not register shortcuts: {error}. Choose another combination in Shortcuts.")),
            }
            }
        }
        Err(error) => state.settings.error = Some(error),
    }
    app.manage(Shortcuts(Mutex::new(state)));
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut) {
    let Some(state) = app.try_state::<Shortcuts>() else {
        return;
    };
    // An event arriving while settings are changing should not block registration on the UI thread.
    let Ok(state) = state.0.try_lock() else {
        return;
    };
    let action = if state
        .settings
        .screenshot
        .trim()
        .parse::<Shortcut>()
        .ok()
        .as_ref()
        == Some(shortcut)
    {
        "screenshot"
    } else if state.settings.copy.trim().parse::<Shortcut>().ok().as_ref() == Some(shortcut) {
        "screenshot-copy"
    } else {
        return;
    };
    drop(state);
    crate::lifecycle::handle_menu(app, action);
}

#[tauri::command]
pub async fn get_capture_shortcuts(
    state: State<'_, Shortcuts>,
) -> Result<CaptureShortcuts, String> {
    Ok(state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .settings
        .clone())
}

#[tauri::command]
pub async fn set_capture_shortcuts(
    app: AppHandle,
    state: State<'_, Shortcuts>,
    mut settings: CaptureShortcuts,
) -> Result<CaptureShortcuts, String> {
    settings.screenshot = settings.screenshot.trim().to_string();
    settings.copy = settings.copy.trim().to_string();
    settings.error = None;
    let next = parse(&settings)?;
    let mut state = state.0.lock().map_err(|error| error.to_string())?;
    let added: Vec<_> = next
        .iter()
        .filter(|key| !state.active.contains(key))
        .copied()
        .collect();
    let removed: Vec<_> = state
        .active
        .iter()
        .filter(|key| !next.contains(key))
        .copied()
        .collect();
    let mut registered = Vec::new();
    let mut unregistered = Vec::new();
    let result = (|| {
        for key in &added {
            app.global_shortcut()
                .register(*key)
                .map_err(|error| format!("Shortcut unavailable or already in use: {error}"))?;
            registered.push(*key);
        }
        for key in &removed {
            app.global_shortcut()
                .unregister(*key)
                .map_err(|error| error.to_string())?;
            unregistered.push(*key);
        }
        persist(&app, &settings).map_err(|error| format!("Could not save shortcuts: {error}"))
    })();
    if let Err(mut error) = result {
        for key in registered {
            if let Err(rollback) = app.global_shortcut().unregister(key) {
                error.push_str(&format!("; could not remove new shortcut: {rollback}"));
                state.active.push(key);
            }
        }
        for key in unregistered {
            if let Err(rollback) = app.global_shortcut().register(key) {
                error.push_str(&format!(
                    "; could not restore previous shortcut: {rollback}"
                ));
                state.active.retain(|active| *active != key);
            }
        }
        state.settings.error = Some(error.clone());
        return Err(error);
    }
    state.active = next;
    state.settings = settings.clone();
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_two_distinct_shortcuts() {
        let keys = parse(&CaptureShortcuts::default()).unwrap();
        assert_eq!(keys.len(), 2);
        assert_ne!(keys[0], keys[1]);
    }
    #[test]
    fn equivalent_shortcuts_are_rejected() {
        let settings = CaptureShortcuts {
            screenshot: "Ctrl+Shift+4".into(),
            copy: "Control+Shift+4".into(),
            error: None,
        };
        assert!(parse(&settings).is_err());
    }
    #[test]
    fn invalid_or_unmodified_shortcuts_are_rejected() {
        for key in ["banana", "4"] {
            let settings = CaptureShortcuts {
                screenshot: key.into(),
                ..Default::default()
            };
            assert!(parse(&settings).is_err(), "{key}");
        }
    }
    #[test]
    fn empty_fields_disable_shortcuts() {
        let settings = CaptureShortcuts {
            screenshot: String::new(),
            copy: String::new(),
            error: None,
        };
        assert!(parse(&settings).unwrap().is_empty());
    }
}
