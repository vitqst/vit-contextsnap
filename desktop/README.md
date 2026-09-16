# ContextSnap Desktop

A small desktop screenshot editor for **Linux and macOS**, built with Rust and Tauri 2.
Capture another application or an area of your screen, then annotate it with the same
React/Canvas editor used by the [Chrome extension](../README.md).

This is the first desktop development version. Build it from source using the instructions
below; the Chrome extension ZIP is not a desktop installer. Windows is not a desktop target yet.

## What it does

- **Capture screenshot** opens your operating system's screenshot picker. ContextSnap hides
  its window during capture and returns afterward, including when you cancel. A successful
  capture immediately replaces the image and annotations in the same editor, without an
  unsaved-work prompt or another window. Save or copy first if you want to keep the previous
  screenshot; canceling or failing a capture preserves the existing work.
- Linux uses the XDG Desktop Portal on X11 and Wayland. Available screen, window, and area
  choices depend on the desktop environment and its screenshot portal backend.
  On X11, if the screenshot portal is missing, an installed `gnome-screenshot` supplies
  an area picker instead. This fallback does not run after permission denial or on Wayland.
- macOS uses the built-in interactive screenshot tool. Drag to select an area; press
  Space to select a window; press Escape to cancel.
- Reuses arrows, editable labels, free drawing, rectangles, text, sticky notes, numbered
  steps, magnifiers, blur, solid redaction, crop, image layers, and undo/redo.
- Every drawing element, including text, labels, and inserted images, supports a configurable
  **Shadow**. Choose **Soft** (default), **Hard**, or turn it off in Drawing properties.
  Shadows scale with zoom and are included in PNG export; crop and selection guides are not.
  Inserted images use rectangular card shadows, preserving transparent interiors without
  filtering private image silhouettes or adding expensive per-pixel shadow work during dragging.
  Redaction takes priority: overlapping text/stroke shadows are suppressed so they cannot
  expose the outline of covered content. Their configured shadow returns when the mask is moved.
- With **Select (V)** active, **Shift-click** elements to add or remove them from the selection.
  **Delete / Backspace** or **Delete selected** removes the whole selection in one undoable
  action. Plain click selects one element; clicking empty space or Escape clears the selection.
- **Copy image** puts a flattened PNG on the native system clipboard.
- **Save PNG** opens a native Save As dialog. Canceling it keeps your work unsaved.
- Open, paste, or drop PNG, JPEG, and WebP images. Dropping into an open document adds a layer.
- **Ctrl+V / Cmd+V** reads an image from the native clipboard. It opens an empty editor or
  adds an undoable image layer to the current screenshot. Text fields keep ordinary text paste.
- Inserted images, drawings, text, and magnifiers share one layer order. New elements appear
  above existing content; **Bring forward / Send backward** work across these object types.
  The original screenshot stays as the background. Blur and redaction stay on top for protection.
- The canvas expands in every direction when arrows, labels, images, or other annotations
  extend beyond the original screenshot. The workspace stays transparent outside the original
  screenshot; exports include all content with white added space unless you explicitly crop it.
- Magnifiers include image layers and annotations beneath them. They exclude other lenses
  to prevent recursive magnification, and solid redaction remains protected.
- Select a magnifier and drag one of its four rim handles to resize it without changing its zoom.
- **Crop (C)** shows corner and edge handles for an existing crop. Drag a handle to resize,
  drag inside to move, or drag outside to replace it. Escape cancels an unfinished adjustment
  and returns to Select; completed adjustments support undo/redo.
- **X hides the editor to the system tray/menu bar**, preserving your image, layers, and undo history.
- The tray menu offers **Screenshot**, **Open editor**, and **Quit ContextSnap**.
  Screenshot captures without showing the old editor first and replaces unexported work
  without confirmation. Opening an image file and Quit still warn before discarding work.
- On Linux/X11, capture completion restores and activates the existing editor with a fresh
  native timestamp, avoiding GNOME's stale-focus “is ready” notification. This also covers
  cancellation and capture errors. No desktop focus settings or always-on-top flags change.
  On Wayland, whether GTK's activation request receives focus remains compositor-controlled.
- **Quit** warns about unexported work; use the tray menu or **Ctrl+Q / Cmd+Q**.
  Closing the window no longer discards work or quits the app.

The capture shortcut is **Ctrl+Shift+S** on Linux and **Cmd+Shift+S** on macOS while
ContextSnap is focused. There is no global capture shortcut or automatic startup in this version.
The app stays running in the tray until you explicitly quit it.
The ordinary editor shortcuts, including Ctrl/Cmd+C to copy and Ctrl/Cmd+Z to undo, also work.

## Zoom and navigation

The image can fill the entire workspace behind the floating toolbar and properties panel.
There are no canvas scrollbars or fixed screenshot-sized viewport boundaries.

- **Ctrl/Cmd + mouse wheel**, or a trackpad pinch: zoom around the pointer.
- **Mouse wheel / trackpad scroll**: pan; Shift+wheel pans horizontally.
- **Space + drag** or **middle-button drag**: pan without moving annotations.
- **+ / − controls** or **Ctrl/Cmd + + / −**: zoom around the workspace center.
- **Fit to screen** or **Ctrl/Cmd+0**: fit the complete expanded document.
- **1:1**: inspect one source image pixel per physical screen pixel.

The default fitted preview is explicitly smoothed for WebKit. Zoom never resizes the source
image or changes exported PNG resolution; export remains lossless at document pixel size.
The preview uses a window-sized drawing surface, not an ever-growing screenshot-sized bitmap.
Dragging beyond an edge updates export bounds without resizing or clearing the visible canvas.
Each canvas frame reads the latest validated drag position directly, without waiting for
the surrounding React controls to finish updating.
Downscaled image previews and unchanged object bounds are cached during dragging. Preview
rasters are limited to 4 megapixels in total; 1:1 view and PNG export still use original pixels.

## Build prerequisites

Use Node.js 22.12+, 24, or 26+, npm, and a current stable Rust toolchain installed with
[rustup](https://rustup.rs/). Native builds must run on the target operating system:
build the Linux app on Linux and the Mac app on macOS.

### Linux

For Ubuntu/Debian with WebKitGTK 4.1 available (use an up-to-date WebKitGTK, 2.40 or newer):

```sh
sudo apt update
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev librsvg2-dev patchelf libayatana-appindicator3-dev xdg-desktop-portal
```

Install the portal backend matching your desktop, for example
`xdg-desktop-portal-gnome` on GNOME or `xdg-desktop-portal-kde` on KDE Plasma.
Many desktop installations already provide these. A generic portal service alone may
not implement screenshots. Log out and back in after changing portal packages.

For X11 systems without a screenshot portal, install `gnome-screenshot` to enable the
area-picker fallback (`sudo apt install gnome-screenshot`). It is already available on
many GNOME installations. Wayland requires the desktop's screenshot portal backend.

The top-bar icon needs an AppIndicator/StatusNotifier tray host. GNOME may need its
AppIndicator extension enabled; KDE Plasma normally provides a tray. If no working host
is detected, X minimizes to the taskbar instead of hiding the editor. Ctrl+Q still quits
from the open editor. Packaged Debian builds declare the AppIndicator runtime dependency.

Use a graphical desktop session with a working user D-Bus session. Headless SSH and
containers without a display/portal cannot open the screenshot picker. See the
[Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux) for other distributions.

### macOS

Use macOS 12.4 or newer and install Xcode Command Line Tools:

```sh
xcode-select --install
```

On first capture, macOS may ask for screen-recording access. Enable the relevant app in
**System Settings → Privacy & Security → Screen Recording** (called **Screen & System
Audio Recording** on some versions), then quit and reopen it. During development, the
permission may be associated with the terminal used to launch the app.

## Run locally

Run these commands from the repository root:

```sh
npm ci
npm run desktop:dev
```

This starts the local Vite frontend and the Rust desktop application together. The first
Rust build downloads and compiles native dependencies and takes longer than later builds.
No application server, account, or API key is needed to use a packaged build.

Click **Capture screenshot**, finish the system picker, annotate the result, then choose
**Copy image** or **Save PNG**. To test the editor without capturing, choose **Open image**.

## Build a desktop package

```sh
npm run desktop:build
```

Build output is under `desktop/src-tauri/target/release/`:

| Platform | Output                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| Linux    | Executable plus packages in `bundle/` (including AppImage and Debian packages) |
| macOS    | `.app` in `bundle/macos/` and disk image in `bundle/dmg/`                      |

For a local executable without installer packaging:

```sh
npm run desktop:build -- --no-bundle
```

Mac builds target the machine's architecture by default. Signing and notarization for
public distribution are not configured. The current implementation targets both operating
systems, but a Linux build does not validate macOS capture, permissions, or packaging.

## Privacy and limits

Screenshots are processed locally. There are no uploads, telemetry, remote fonts, or
network services in the packaged application. Capture happens only when you request it.

- Source images, layers, and undo history remain in memory for the open session.
- The desktop app does not save a Recent image history. Save PNG keeps only the flattened
  exported image at the location you choose; Copy image uses the system clipboard.
- Drawing preferences are stored in the desktop WebView's local storage. Extension and
  desktop storage are separate.
- Native capture temporarily creates a local screenshot file. ContextSnap removes the
  requested capture file after reading it, including when validation fails.
- Closing to the tray preserves editable objects in memory. Quitting or reloading the
  editor discards them. A successful new screenshot also discards the previous scene and
  its undo history immediately. Save or copy work before quitting or taking another screenshot.
- **macOS Dock → Quit bypasses the unsaved-work warning in this development version.**
  Use the tray's Quit action or the app's Quit menu/Cmd+Q instead, and export before
  quitting through the Dock, logging out, or shutting down.
- Imported backgrounds are limited to 50 MB, 32 megapixels, and 16,384 pixels per side;
  inserted layers keep the shared editor's 20 MB/file and 16 MP/session limits.
- Expanded documents retain the 32-megapixel / 16,384-pixel-per-side safety limits.
  An action exceeding these limits is rejected with a message rather than allocating a huge canvas.
- **Blur is cosmetic. Use solid Redact for secrets.** Redaction also covers pixels sampled
  by magnifiers. Exported PNGs contain no editable layers or selection handles.

## Troubleshooting

**Linux capture fails or no picker appears:** check that your desktop's screenshot portal
backend is installed and active, or that `gnome-screenshot` is installed on X11. Picker
capabilities and prompts vary by compositor.
Open an existing image to continue editing while resolving portal configuration.

**macOS capture is denied or contains blank windows:** check screen-recording permissions,
restart the app, and retry. Some protected application content cannot be captured.

**Copy does not paste into another app:** try a target that accepts images, or use Save PNG.
Clipboard contents can be replaced by other applications or clipboard managers.

**Vite port is already in use:** close the earlier ContextSnap development process.
The desktop development URL uses the fixed local port `1420`; browser tests use `1421`.

## Verification and code layout

From the repository root:

```sh
npm run check                   # Shared editor and Chrome regression checks
npm run desktop:build:web       # Desktop TypeScript and frontend production build
npm run desktop:test            # Rust image validation and native helper tests
npx playwright install chromium webkit
npm run desktop:test:e2e        # Editor tests with a simulated native bridge
```

The opt-in native activation regression briefly focuses **test-owned windows** on GNOME/X11.
It checks that a hidden, minimized, or visible editor regains focus after a separate
picker-like process, without creating another editor. It does not capture the screen or
touch the document in a running ContextSnap instance:

```sh
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib \
  activation::tests::capture_return_restores_focus_to_the_same_editor_window \
  -- --ignored --exact --nocapture --test-threads=1
```

Browser tests use synthetic screenshots and simulate the native bridge; they do not verify
OS permission prompts or screen capture. On each real OS, also check capture success and
Escape cancellation, denied permission, replacing unsaved work, canceled Save As, native
clipboard paste, and closing with unsaved work. Verify high-DPI and multiple-display capture
on the configurations you intend to support.

Magnifiers at the same layer depth share a cached non-lens scene; moving a lens normally does
not re-render its annotation source, including when it moves beyond the screenshot. Lenses at
different depths sample their own underlying content. Lens-source caches are limited to eight
surfaces and 32 megapixels in total. Blur and redaction protect the composited content, including
inserted images and annotations. Changing content beneath a lens or a privacy effect still
rebuilds that source, so large effect-heavy scenes cost more than ordinary image dragging.
For scenes without lenses and underlays up to 8 megapixels, moving only a blur reuses the
unchanged drawing underlay. Where native canvas blur is unavailable, interactive previews
use strength-scaled downsampling (up to 8× per axis); redactions are applied before sampling,
and PNG exports keep full-resolution blur processing. This reduces CPU work but is not a
fixed pixel budget. A controlled browser check reduced median render time from 36–43 ms to
6–9 ms for both moving a blur and moving an image beneath a stationary blur. See the
[performance investigation](../docs/performance/2026-09-16-blur-drag.md) for the fixture,
quality checks, and limitations; this is not a frame-rate guarantee or a repeat recording
of the user's document.
A synthetic 1920×1080 benchmark with 256 shapes and four moving lenses reports median and
95th-percentile render times in `tests/desktop/scene-rendering.spec.ts`. These are not performance
guarantees: hardware, large images, blur, and changes that invalidate the source cache cost more.
`tests/desktop/expansion-performance.spec.ts` also checks that outward dragging causes no
visible-canvas dimension changes or blank screenshot frames, while expanded export still works.
`tests/desktop/image-drag-performance.spec.ts` checks that moving a large image reuses its
display raster and that export retains the original full-resolution pixels.
`tests/desktop/drag-latency.spec.ts` checks that painted frames track the latest pointer
position, including cancellation, undo/redo, and rejection of oversized drafts.

```text
desktop/
  README.md             Desktop setup and usage
  index.html, main.tsx   Desktop React entrypoint
  platform.ts           Native clipboard, save, capture, settings, and close adapter
  src-tauri/            Rust commands, native capture, Tauri configuration
src/editor/             Shared editor and Canvas renderer
src/core/               Shared drawing model, geometry, and history
src/platform/           Editor host interface and Chrome implementation
vite.desktop.config.ts  Desktop frontend build, separate from WXT
```

The project uses the [MIT license](../LICENSE). See the separate
[desktop dependency notices](THIRD_PARTY_NOTICES.md) for native dependencies and generated
notices, and [shared JavaScript notices](../THIRD_PARTY_NOTICES.md) for the editor.
