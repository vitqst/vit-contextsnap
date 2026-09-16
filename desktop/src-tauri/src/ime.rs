use webkit2gtk::{InputMethodContextExt, WebView, WebViewExt};

pub fn enable_inline_preedit(view: &WebView) {
    // Wry 0.55.1 disables GTK preedit to work around Fcitx candidate positioning.
    // With IBus/Bamboo this removes IBUS_CAP_PREEDIT_TEXT, so composition stays
    // in the external IME popup until commit and never reaches our live canvas.
    // Opt this editor back into standard inline composition; leave user IME
    // configuration and other operating systems untouched.
    if let Some(context) = view.input_method_context() {
        context.set_enable_preedit(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gtk::{
        gdk,
        glib::{gobject_ffi, translate::*},
        prelude::*,
    };
    use std::{cell::Cell, rc::Rc};
    use webkit2gtk::{InputMethodContextExt, WebViewExt};

    // Run in an isolated display/session, never against the user's active IME:
    // xvfb-run -a dbus-run-session -- env GTK_IM_MODULE=simple cargo test ...
    //   ime::tests::restores_inline_preedit_after_wry_setup -- --ignored --test-threads=1
    #[test]
    #[ignore = "requires an isolated Xvfb display and GTK_IM_MODULE=simple"]
    fn restores_inline_preedit_after_wry_setup() {
        assert_eq!(std::env::var("GTK_IM_MODULE").as_deref(), Ok("simple"));
        gtk::init().expect("GTK test display must be available");
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        let view = WebView::new();
        window.add(&view);
        window.show_all();
        let context = view.input_method_context().expect("WebKit GTK IM context");
        let _trace = NativePreeditTrace::install(&context);
        let changes = Rc::new(Cell::new(0));
        let observed = changes.clone();
        context.connect_preedit_changed(move |_| observed.set(observed.get() + 1));
        context.notify_focus_in();

        // Reproduce the setting applied by the locked Wry runtime.
        context.set_enable_preedit(false);
        assert_eq!(LAST_ENABLED.with(Cell::get), Some(false));

        enable_inline_preedit(&view);
        assert_eq!(
            LAST_ENABLED.with(Cell::get),
            Some(true),
            "override must restore the native preedit capability"
        );
        compose_prefix(&context, &window);
        assert!(
            changes.get() > 0,
            "inline composition must reach WebKit before Enter/commit"
        );
        context.reset();
        window.close();
    }

    type PreeditSetter = unsafe extern "C" fn(*mut webkit2gtk::ffi::WebKitInputMethodContext, i32);
    thread_local! {
        static ORIGINAL_SETTER: Cell<Option<PreeditSetter>> = const { Cell::new(None) };
        static LAST_ENABLED: Cell<Option<bool>> = const { Cell::new(None) };
    }

    // WebKit has no preedit-enabled getter. Observe the real native virtual method,
    // forwarding to its original implementation; do not substitute a fake IM context.
    // GtkIMContextSimple always emits Compose preedit, irrespective of this setting,
    // so its signals alone cannot detect the IBus capability regression.
    struct NativePreeditTrace {
        class: *mut webkit2gtk::ffi::WebKitInputMethodContextClass,
        original: Option<PreeditSetter>,
    }

    impl NativePreeditTrace {
        fn install(context: &webkit2gtk::InputMethodContext) -> Self {
            unsafe {
                let class = gobject_ffi::g_type_class_ref(context.type_().into_glib())
                    .cast::<webkit2gtk::ffi::WebKitInputMethodContextClass>();
                let original = (*class).set_enable_preedit;
                assert!(
                    original.is_some(),
                    "GTK context must implement preedit settings"
                );
                ORIGINAL_SETTER.with(|setter| setter.set(original));
                LAST_ENABLED.with(|value| value.set(None));
                (*class).set_enable_preedit = Some(observe_preedit);
                Self { class, original }
            }
        }
    }

    impl Drop for NativePreeditTrace {
        fn drop(&mut self) {
            unsafe {
                (*self.class).set_enable_preedit = self.original;
                gobject_ffi::g_type_class_unref(self.class.cast());
            }
            ORIGINAL_SETTER.with(|setter| setter.set(None));
        }
    }

    unsafe extern "C" fn observe_preedit(
        context: *mut webkit2gtk::ffi::WebKitInputMethodContext,
        enabled: i32,
    ) {
        LAST_ENABLED.with(|value| value.set(Some(enabled != 0)));
        if let Some(original) = ORIGINAL_SETTER.with(Cell::get) {
            original(context, enabled);
        }
    }

    fn compose_prefix(context: &webkit2gtk::InputMethodContext, window: &gtk::Window) {
        for key in [
            gdk::keys::constants::Multi_key,
            gdk::keys::constants::apostrophe,
        ] {
            let mut event = gdk::Event::new(gdk::EventType::KeyPress)
                .downcast::<gdk::EventKey>()
                .expect("key event");
            // GDK's Rust API exposes no keyval setter. This event and its retained
            // fixture window are owned locally; it never enters the desktop queue.
            unsafe {
                let native = event.to_glib_none_mut().0;
                (*native).keyval = *key;
                (*native).window = window
                    .window()
                    .expect("realized fixture window")
                    .to_glib_full();
                (*native).send_event = 1;
            }
            context.filter_key_event(&mut event);
        }
    }
}
