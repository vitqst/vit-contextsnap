# Changelog

## Unreleased

- Add configurable Soft/Hard shadows to all drawing elements, text, labels, images, and effects.
  Keep opaque redactions and source-pixel shadow sizing in previews and expanded PNG exports.
- Replace desktop screenshots immediately in the existing editor without a discard prompt;
  skip reopening the old editor before tray capture, and keep prior work on cancellation/error.
- Add Shift-click multi-selection with Select (V), a group delete action, and one-step undo/redo.
- Add a Linux/macOS desktop application using Tauri and Rust, with a separate desktop README.
  Reuse the editor through host adapters for capture, clipboard, saving, settings, and close warnings.
- Open system screenshot pickers, copy flattened PNGs to the native clipboard, and save with
  a native dialog. Canceling capture or Save As preserves the current editing session.
- Add a pixel blur fallback for WebViews without native Canvas filter support.
- Keep the desktop editor in a tray/menu-bar icon after X, with Screenshot, Open editor, and
  Quit actions; minimize instead when Linux has no tray host. Add native clipboard image paste.
- Smooth fitted WebKit previews, add a 1:1 view, and allow full-workspace zoom/pan beneath
  floating controls without desktop scrollbars.
- Expand the document and PNG around annotations outside the original screenshot, including
  negative coordinates. Preserve explicit crops and enforce safe raster-size limits.
- Keep preview rasters viewport-sized and paint once per animation frame to avoid flashing
  during expansion. Show white added space only in exports; retain transparent editor workspace.
  Reuse image/blur/magnifier buffers when unrelated objects change the document bounds.
- Include annotations in magnifiers using a shared nonrecursive cache while preserving
  redaction before blur and lens sampling.
- Share layer ordering across inserted images, annotations, and magnifiers; honor forward/backward
  actions in both preview and export while keeping blur and redaction protected on top.
- Add draggable crop corner/edge handles, crop movement, and magnifier rim resize handles,
  with undo/redo and cancellation support at any zoom.
- Reuse bounded high-quality display rasters and immutable object bounds during image dragging;
  keep original pixels for 1:1 view and PNG export.
- Paint the latest validated pointer position directly, removing the extra React-to-canvas frame
  delay while preserving cancellation and history behavior.
- Reduce CPU blur preview work with strength-scaled downsampling and reuse unchanged,
  sanitized artwork when moving a blur. Keep redactions opaque and PNG blur full-resolution.
  Document recording analysis, controlled drag benchmarks, and Excalidraw rendering patterns.

## 0.2.0-rc.3 — Label placement fixes

Chrome uses numeric version `0.2.0.3` and display name `0.2.0-rc.3`.

- Place arrow labels above the tail by default. Drag labels independently, keep their offsets
  when moving or resizing the arrow, and reset their position from the properties panel.
- Place rectangle labels above the top edge. Add Top, Bottom, Inside, and Free positioning,
  automatic Free mode on drag, and rectangle corner resizing with attached labels.
- Share typography, label sizing, shape colors, and plain text rendering across shape labels.
  Remove white backgrounds, halos, connector lines, and text shadows in preview and PNG export.
- Keep independent label movement undoable, preserve crop-clamped drag positions, and avoid
  selecting empty space between a shape and its moved label.

See [preview notes and installation/update instructions](docs/releases/0.2.0-rc.3.md).

## 0.2.0-rc.2 — Prerelease preview

This optional preview includes the rc.1 image-layer and Back to website features plus
the drawing refinements below. Public v0.2.0 remains the stable default download.
Chrome uses numeric version `0.2.0.2` and display name `0.2.0-rc.2`.

- Attach arrow labels in a midpoint gap; dragging a label moves its whole arrow. Add
  Straight/Curved controls for new and existing arrows without moving their endpoints.
  Arrow label font size stays fixed as arrow length changes; long labels wrap.
- Add a shared default-on Shadow toggle for each arrow and its label, and a separate
  default-on toggle for sticky cards.
  Other annotations and shape notes stay flat.
- Double-click shapes to add or edit an attached note. Step notes stay clear of the numbered
  circle, moving above it near the bottom edge.
- Add colored sticky notes (N) with direct text editing, movement, and corner resizing.
  Only sticky-card text scales when its object is resized.
- Make free-draw width respond to pen pressure when available, or mouse speed measured
  over elapsed time. Add Smoothing, Pressure influence, and Speed influence controls for
  selected and subsequent strokes; zero influences give constant width.
- Include drawing refinements in undo/redo and flattened PNG/clipboard export.
- Disable generated JavaScript module preload hints in extension pages to avoid Chrome's
  cross-world resource mismatch and unused-preload warnings. Normal module imports and
  stylesheets remain bundled locally; no permissions change.

See [preview notes and installation/update instructions](docs/releases/0.2.0-rc.2.md).

## 0.2.0-rc.1 — Prerelease preview

This RC label identifies a newer preview after public v0.2.0. It does not
replace that stable release or become the default download. Chrome uses numeric version
`0.2.0.1` and display name `0.2.0-rc.1`.

- Back to website preserves the editor tab and undo history; unavailable or changed source
  tabs fall back to the saved HTTP(S) URL. Recent exports always reopen the saved URL.
- Add local PNG/JPEG/WebP image layers with Add image, clipboard paste, or drag and drop.
- Move and proportionally resize image layers; duplicate, delete, nudge, and undo/redo.
- Send backward / Bring forward within consistent paint families. Images stay below
  drawings and are included in blur, magnifier, redaction, clipboard, and PNG export.
- Bound decoded image assets per session and share them across duplicate/history objects.
- No new extension permissions, external services, or dependencies.
- Native capture tests wait up to five seconds for a readable Chrome surface before
  sending the actual shortcut. Only the known surface-unavailable protocol error is
  retried; unrelated errors fail immediately and whole tests are not retried.
- Use an explicit 1920 × 1200, 24-bit Xvfb screen for native browser verification.

See [preview notes and installation instructions](docs/releases/0.2.0-rc.1.md).

## 0.2.0 — First public release

- Visible-page and selected-area capture in Chrome, with a dedicated screenshot editor.
- Sketch or clean arrows, pen, rectangles, text, solid redaction, crop, zoom, and undo/redo.
- Wrapped arrow labels, independent label sizing, image/crop-aware placement, and direct
  label dragging with reset position.
- Numbered step circles, circular screenshot magnifiers, and adjustable region blur.
- Magnifiers sample privacy-processed pixels; keep solid Redact for sensitive information.
- Select, move, duplicate, and delete annotations; copy or download flattened PNGs.
- Open local PNG, JPEG, or WebP screenshots and revisit flattened exports in local Recent.
- Downloadable Chrome ZIP for installation without Node.js or npm.
- MIT license, bundled third-party notices, contribution/security guidance, issue/PR
  templates, and least-privilege CI defaults.
- Clarify the historical specification and actual screenshot/privacy limits.

See [release notes and installation instructions](docs/releases/0.2.0.md).

## 0.1.0 — Internal development version (unreleased)

Initial screenshot-first implementation, not a public release: visible/area capture, dedicated editor,
editable sketch/clean arrows with labels, pen/rectangle/text/redaction, crop and zoom,
undo/redo, PNG clipboard/download, and local Recent exports.
