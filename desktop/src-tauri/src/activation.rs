use gtk::{gdk, prelude::*};

/// Present the existing editor from a user-requested capture or menu action.
/// The caller must be on the GTK main thread.
pub(super) fn present_editor(window: &gtk::Window) {
    window.realize();
    let timestamp = window
        .window()
        .and_then(|native| native.downcast::<gdkx11::X11Window>().ok())
        .map(|native| {
            let gdk_window = native.upcast_ref::<gdk::Window>();
            // GDK's server-time round trip requires property notifications.
            // Preserve the toolkit's other event subscriptions.
            gdk_window.set_events(gdk_window.events() | gdk::EventMask::PROPERTY_CHANGE_MASK);
            // The external picker advances GNOME's interaction time but cannot
            // update this process's cached GTK time or return an activation token.
            // Request fresh activation only in these explicit user-return paths.
            let timestamp = gdkx11::functions::x11_get_server_time(&native);
            native.set_user_time(timestamp);
            timestamp
        })
        // Do not call X11 APIs on Wayland or manufacture a Wayland activation token.
        .unwrap_or_else(gtk::current_event_time);

    // Synchronous GTK show/deiconify avoids Tao dropping focus while its queued
    // visibility changes are still pending. Present AFTER showing: GTK's hidden
    // branch can retain an old timestamp on an already-realized window's remap.
    window.show_all();
    window.deiconify();
    window.present_with_time(timestamp);
}

#[cfg(test)]
#[path = "activation_tests.rs"]
mod tests;
