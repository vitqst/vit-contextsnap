# Changelog

## Unreleased

Local development changes only; not included in the public v0.2.0 or v0.2.0-rc.1 ZIPs.

- Attach arrow labels in a midpoint gap; dragging a label moves its whole arrow. Add
  Straight/Curved controls for new and existing arrows without moving their endpoints.
- Add a default-on Shadow toggle for arrows and their labels, and for sticky cards.
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
