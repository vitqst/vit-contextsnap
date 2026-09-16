# Linux capture-return activation

## Scope

Restore the existing ContextSnap editor to the foreground after its user-requested
screenshot picker returns. Preserve the existing document on cancel/error and the
single-window workflow. Do not change GNOME settings, add permanent always-on-top
behavior, or introduce timed focus retries.

## Diagnosis and approach

The locked Tao Linux implementation queues show/deiconify separately and can drop
an immediate focus request while the old visibility/minimized state remains. Its
GTK presentation also uses timestamp zero, which GTK resolves to the application's
last interaction. That timestamp can predate interaction with the external picker;
GNOME then displays an attention notification instead of activating the editor.

Run GTK show, deiconify, and presentation in a single main-thread callback. For an
actual X11 GDK window, acquire a current server timestamp with the property-change
event mask enabled and pass it to presentation. This is explicitly limited to the
existing user-requested capture/menu restore paths, never background notifications.
The screenshot portal supplies no return activation token. Timestamped presentation
is an X11-specific request, not a cross-platform guarantee of focus. Wayland keeps
normal GTK presentation, and macOS keeps its current Tauri path.

Regression checks use test-owned GTK windows and a separate picker-like process;
they do not replace or inspect the user's current editor document. Wait for actual
window state with bounded deadlines, not fixed sleeps. Keep queued restoration
from overriding a later hide/capture request.

## Checklist

- [x] Reproduce stale activation with a failing native test.
- [x] Implement and verify main-thread X11 presentation and stale-request guards.
- [x] Run Rust tests, formatting, focused desktop browser tests, and code review.
- [x] Update the desktop README and build the Linux development package.

## Verification results

On GNOME 42.9/X11, the native regression failed with the old zero-timestamp GTK
presentation: the hidden editor did not regain focus after the separate picker.
The same regression passed with the patch for hidden, minimized, and visible
states, retaining the same native window ID. Test-owned windows/processes were
closed afterward; no actual screenshot capture or existing document was touched.

All 32 ordinary Rust tests and 24 focused Chromium/WebKit capture-flow tests passed.
The two native-test entries remain opt-in in the ordinary Rust suite; the parent
regression and its picker subprocess were explicitly run above. Rust formatting,
documentation formatting, diff checks, TypeScript checking, the desktop frontend
build, and the unsigned Linux `.deb` build passed. Independent review found no
critical or important issues. The existing package-license warnings remain.

Wayland activation and macOS were not exercised. GNOME's focus configuration was
left unchanged. A full real-picker capture remains a manual smoke check separate
from the native focus regression.

No commit or system-wide configuration changes are requested.
