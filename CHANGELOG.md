# Changelog

## Unreleased

- Back to website preserves the editor tab and undo history; unavailable or changed source
  tabs fall back to the saved HTTP(S) URL. Recent exports always reopen the saved URL.
- Add local PNG/JPEG/WebP image layers with Add image, clipboard paste, or drag and drop.
- Move and proportionally resize image layers; duplicate, delete, nudge, and undo/redo.
- Send backward / Bring forward within consistent paint families. Images stay below
  drawings and are included in blur, magnifier, redaction, clipboard, and PNG export.
- Bound decoded image assets per session and share them across duplicate/history objects.
- No new extension permissions, external services, or dependencies.

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
