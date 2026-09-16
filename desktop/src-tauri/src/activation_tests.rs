//! Real window-manager regression tests, opt-in because they briefly focus test-owned windows.
//! Run only on an available GNOME/X11 desktop, with `--ignored --test-threads=1`.

use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
    time::{Duration, Instant},
};

use gtk::{gdk, glib, prelude::*};

const FIXTURE_ENV: &str = "CONTEXTSNAP_ACTIVATION_TEST_PICKER";
const READY_PREFIX: &str = "CONTEXTSNAP_PICKER_FOCUSED ";
const TIMEOUT: Duration = Duration::from_secs(5);

fn pump_events() {
    let context = glib::MainContext::default();
    // Bound each drain so a repeating event cannot starve the timeout/condition.
    for _ in 0..100 {
        if !context.pending() {
            break;
        }
        context.iteration(false);
    }
}

fn wait_until(description: &str, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + TIMEOUT;
    loop {
        pump_events();
        if ready() {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "Timed out waiting for {description}"
        );
        // Poll actual GTK/window-manager state; this is not a guessed focus delay.
        thread::sleep(Duration::from_millis(10));
    }
}

fn init_x11(program: &str) -> gdkx11::X11Display {
    glib::set_prgname(Some(program));
    gtk::init().expect("This ignored test requires a working GTK desktop");
    gdk::set_program_class(program);
    gdk::Display::default()
        .expect("GTK display")
        .downcast::<gdkx11::X11Display>()
        .expect("Run the native activation regression on X11, not Wayland")
}

struct TestWindow(gtk::Window);

impl TestWindow {
    fn new(title: &str) -> Self {
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        window.set_title(title);
        window.set_default_size(320, 180);
        window.add_events(gdk::EventMask::PROPERTY_CHANGE_MASK);
        window.realize();
        Self(window)
    }

    fn native(&self) -> gdkx11::X11Window {
        self.0
            .window()
            .expect("Realized GTK window")
            .downcast::<gdkx11::X11Window>()
            .expect("X11 toplevel")
    }

    fn has_focus(&self) -> bool {
        self.0.is_active() && self.0.has_toplevel_focus()
    }

    fn present_fresh(&self) -> u32 {
        let native = self.native();
        let timestamp = gdkx11::functions::x11_get_server_time(&native);
        native.set_user_time(timestamp);
        self.0.show_all();
        self.0.deiconify();
        self.0.present_with_time(timestamp);
        wait_until("test fixture to gain actual keyboard focus", || {
            self.has_focus()
        });
        timestamp
    }
}

impl Drop for TestWindow {
    fn drop(&mut self) {
        // Only this test-created GTK window is closed, never a running editor.
        self.0.close();
        pump_events();
    }
}

struct PickerProcess {
    child: Child,
    output: Receiver<String>,
}

impl PickerProcess {
    fn spawn() -> Self {
        let mut child = Command::new(std::env::current_exe().expect("Test executable"))
            .args([
                "--ignored",
                "--exact",
                "activation::tests::picker_fixture",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(FIXTURE_ENV, "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Start the test-owned picker process");
        let stdout = child.stdout.take().expect("Picker stdout");
        let (send, output) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if send.send(line).is_err() {
                    break;
                }
            }
        });
        Self { child, output }
    }

    fn focused_timestamp(&mut self) -> u32 {
        let mut timestamp = None;
        wait_until(
            "the separate picker process to report actual keyboard focus",
            || {
                while let Ok(line) = self.output.try_recv() {
                    if let Some((_, value)) = line.split_once(READY_PREFIX) {
                        timestamp = Some(value.trim().parse::<u32>().expect("Picker timestamp"));
                    }
                }
                if timestamp.is_some() {
                    return true;
                }
                if let Some(status) = self.child.try_wait().expect("Inspect picker process") {
                    panic!("Picker fixture exited before acquiring focus: {status}");
                }
                false
            },
        );
        timestamp.expect("Focused picker timestamp")
    }
}

impl Drop for PickerProcess {
    fn drop(&mut self) {
        // The Child handle is created here, never resolved by a name/PID search.
        // Killing this fixture also lets X11 destroy only its own test window.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "Requires GNOME/X11; briefly focuses only test-owned GTK windows"]
fn capture_return_restores_focus_to_the_same_editor_window() {
    let display = init_x11("ContextSnapActivationTestEditor");
    let editor = TestWindow::new("ContextSnap activation test — editor fixture");
    let editor_xid = editor.native().xid();

    for state in ["hidden", "minimized", "visible"] {
        editor.present_fresh();
        let stale_editor_time = display.user_time();
        assert_ne!(
            stale_editor_time, 0,
            "Fixture must seed nonzero stale user time"
        );
        match state {
            "hidden" => {
                editor.0.hide();
                wait_until("editor fixture to unmap", || !editor.0.is_mapped());
            }
            "minimized" => {
                editor.0.iconify();
                wait_until("editor fixture to minimize", || {
                    editor
                        .native()
                        .upcast_ref::<gdk::Window>()
                        .state()
                        .contains(gdk::WindowState::ICONIFIED)
                });
            }
            "visible" => {}
            _ => unreachable!(),
        }

        let mut picker = PickerProcess::spawn();
        let picker_time = picker.focused_timestamp();
        wait_until("editor fixture to lose focus to the picker", || {
            !editor.has_focus()
        });
        assert!(
            picker_time.wrapping_sub(stale_editor_time) < (1 << 31)
                && picker_time != stale_editor_time,
            "Picker user time {picker_time} must be newer than stale editor time {stale_editor_time}"
        );
        assert_eq!(
            display.user_time(),
            stale_editor_time,
            "External picker must not accidentally refresh the editor's GTK event time"
        );

        // Exercise production presentation, not the fixture's fresh-time setup.
        super::present_editor(&editor.0);
        wait_until(
            &format!("{state} editor to regain actual keyboard focus"),
            || {
                editor.has_focus()
                    && editor.0.is_mapped()
                    && !editor
                        .native()
                        .upcast_ref::<gdk::Window>()
                        .state()
                        .contains(gdk::WindowState::ICONIFIED)
            },
        );
        assert_eq!(
            editor.native().xid(),
            editor_xid,
            "Reuse the same native window"
        );
        assert_eq!(
            gtk::Window::list_toplevels().len(),
            1,
            "Do not create another editor"
        );
        drop(picker);
    }
}

#[test]
#[ignore = "Subprocess fixture for the native activation regression"]
fn picker_fixture() {
    if std::env::var_os(FIXTURE_ENV).is_none() {
        return;
    }
    init_x11("ContextSnapActivationTestPicker");
    let picker = TestWindow::new("ContextSnap activation test — system picker fixture");
    let timestamp = picker.present_fresh();
    println!("\n{READY_PREFIX}{timestamp}");
    std::io::stdout()
        .flush()
        .expect("Flush picker focus signal");
    // The parent owns and terminates this child. The upper bound prevents an
    // orphan fixture if the parent is externally terminated before RAII cleanup.
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        pump_events();
        thread::sleep(Duration::from_millis(10));
    }
}
