use crate::image_io::read_png_file;

#[cfg(target_os = "linux")]
fn should_use_x11_fallback(
    error: &ashpd::Error,
    session_type: Option<&str>,
    wayland_display: Option<&str>,
) -> bool {
    matches!(error, ashpd::Error::PortalNotFound(interface)
        if interface.as_str() == "org.freedesktop.portal.Screenshot")
        && session_type == Some("x11")
        && wayland_display.is_none_or(str::is_empty)
}

#[cfg(target_os = "linux")]
fn gnome_capture_created(
    success: bool,
    exit_code: Option<i32>,
    stderr: &[u8],
    file_exists: bool,
) -> Result<bool, String> {
    if success {
        return Ok(file_exists);
    }
    if !file_exists && exit_code == Some(1) && stderr.is_empty() {
        return Ok(false);
    }
    let detail = String::from_utf8_lossy(stderr);
    let detail = detail.trim();
    Err(if detail.is_empty() {
        format!("X11 area capture failed (exit status {exit_code:?}).")
    } else {
        format!("X11 area capture failed: {detail}")
    })
}

#[cfg(target_os = "linux")]
async fn capture_x11_area() -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let temporary = tempfile::Builder::new()
            .prefix("contextsnap-capture-")
            .tempdir()
            .map_err(|error| format!("Could not create capture directory: {error}"))?;
        let path = temporary.path().join("capture.png");
        let output = std::process::Command::new("gnome-screenshot")
            .arg("--area")
            .arg("--file")
            .arg(&path)
            .output()
            .map_err(|error| format!(
                "The Screenshot portal is unavailable and gnome-screenshot could not start: {error}. Install gnome-screenshot for X11 area capture, or enable a Screenshot portal backend."
            ))?;
        if !gnome_capture_created(
            output.status.success(),
            output.status.code(),
            &output.stderr,
            path.exists(),
        )? {
            return Ok(Vec::new());
        }
        read_png_file(&path)
    })
    .await
    .map_err(|error| format!("Screenshot worker failed: {error}"))?
}

#[cfg(target_os = "linux")]
pub async fn screenshot() -> Result<Vec<u8>, String> {
    use ashpd::desktop::{screenshot::Screenshot, ResponseError};

    let response = match Screenshot::request()
        .interactive(true)
        .modal(true)
        .send()
        .await
    {
        Ok(request) => request.response(),
        Err(error) => Err(error),
    };
    let screenshot = match response {
        Ok(screenshot) => screenshot,
        Err(ashpd::Error::Response(ResponseError::Cancelled)) => return Ok(Vec::new()),
        Err(error) if should_use_x11_fallback(
            &error,
            std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
            std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
        ) => return capture_x11_area().await,
        Err(error) => return Err(format!(
            "Screen capture failed: {error}. Linux needs xdg-desktop-portal and a desktop backend with Screenshot support."
        )),
    };
    let path = portal_file_path(screenshot.uri().as_str())?;
    tauri::async_runtime::spawn_blocking(move || {
        // The portal creates this screenshot for this request. Remove it even if decoding fails.
        let temporary = PortalScreenshot(path);
        read_png_file(&temporary.0)
    })
    .await
    .map_err(|error| format!("Screenshot worker failed: {error}"))?
}

#[cfg(target_os = "linux")]
struct PortalScreenshot(std::path::PathBuf);

#[cfg(target_os = "linux")]
impl Drop for PortalScreenshot {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_file(&self.0) {
            eprintln!("Could not remove temporary portal screenshot: {error}");
        }
    }
}

#[cfg(target_os = "linux")]
fn portal_file_path(uri: &str) -> Result<std::path::PathBuf, String> {
    let uri = url::Url::parse(uri).map_err(|_| "Portal returned an invalid screenshot URI.")?;
    if uri.scheme() != "file"
        || uri.host_str().is_some()
        || uri.query().is_some()
        || uri.fragment().is_some()
    {
        return Err("Portal screenshot must be a local file URI.".into());
    }
    uri.to_file_path()
        .map_err(|_| "Portal screenshot URI is not a local path.".into())
}

#[cfg(target_os = "macos")]
pub async fn screenshot() -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        // A private directory avoids races and leaves no images behind after cancel/error.
        let temporary = tempfile::Builder::new().prefix("contextsnap-capture-").tempdir()
            .map_err(|error| format!("Could not create capture directory: {error}"))?;
        let path = temporary.path().join("capture.png");
        let output = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-i", "-x", "-t", "png"])
            .arg(&path)
            .output()
            .map_err(|error| format!("Could not start macOS screen capture: {error}"))?;

        if !path.exists() && (output.status.success()
            || (output.status.code() == Some(1) && output.stderr.is_empty())) {
            return Ok(Vec::new());
        }
        if !output.status.success() {
            return Err(format!(
                "Screen capture failed: {}. Allow ContextSnap Desktop (or your terminal during development) in System Settings > Privacy & Security > Screen Recording.",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        read_png_file(&path)
    }).await.map_err(|error| format!("Screenshot worker failed: {error}"))?
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub async fn screenshot() -> Result<Vec<u8>, String> {
    Err("Screen capture is currently supported on Linux and macOS.".into())
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn fallback_requires_missing_screenshot_portal_and_confirmed_x11() {
        let missing =
            ashpd::Error::PortalNotFound("org.freedesktop.portal.Screenshot".try_into().unwrap());
        assert!(should_use_x11_fallback(&missing, Some("x11"), None));
        for (session, wayland) in [
            (Some("wayland"), None),
            (Some("x11"), Some("wayland-0")),
            (None, None),
            (Some("tty"), None),
        ] {
            assert!(!should_use_x11_fallback(&missing, session, wayland));
        }
        for error in [
            ashpd::Error::Response(ashpd::desktop::ResponseError::Cancelled),
            ashpd::Error::Response(ashpd::desktop::ResponseError::Other),
            ashpd::Error::NoResponse,
            ashpd::Error::PortalNotFound("org.freedesktop.portal.FileChooser".try_into().unwrap()),
        ] {
            assert!(!should_use_x11_fallback(&error, Some("x11"), None));
        }
    }

    #[test]
    fn successful_gnome_capture_requires_a_file() {
        assert_eq!(gnome_capture_created(true, Some(0), b"", true), Ok(true));
        assert_eq!(gnome_capture_created(true, Some(0), b"", false), Ok(false));
        assert_eq!(
            gnome_capture_created(true, Some(0), b"resorting to fallback X11", false),
            Ok(false)
        );
    }

    #[test]
    fn gnome_cancel_is_distinct_from_command_failure() {
        assert_eq!(gnome_capture_created(false, Some(1), b"", false), Ok(false));
        assert!(gnome_capture_created(false, Some(1), b"Permission denied", false).is_err());
        assert!(gnome_capture_created(false, Some(2), b"", false).is_err());
        assert!(gnome_capture_created(false, None, b"", false).is_err());
        assert!(gnome_capture_created(false, Some(1), b"", true).is_err());
    }

    #[test]
    fn accepts_and_decodes_local_portal_file_uris() {
        assert_eq!(
            portal_file_path("file:///tmp/screen%20shot.png"),
            Ok(PathBuf::from("/tmp/screen shot.png"))
        );
    }

    #[test]
    fn rejects_remote_or_ambiguous_portal_uris() {
        for uri in [
            "https://example.com/shot.png",
            "file://remote/tmp/shot.png",
            "file:///tmp/shot.png?x=1",
            "file:///tmp/shot.png#fragment",
            "/tmp/shot.png",
        ] {
            assert!(portal_file_path(uri).is_err(), "accepted {uri}");
        }
    }
}
