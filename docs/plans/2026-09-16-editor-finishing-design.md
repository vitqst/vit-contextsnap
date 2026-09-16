# Editor shadows, fast capture, and multi-selection

## Behavior

- Every document element supports an enabled shadow with Soft or Hard styling. Soft is
  the default; Off remains available and existing `shadow: false` settings remain off.
  Text, labels, inserted images, and effect boundaries use the same controls. Crop and
  selection guides are not exported elements. Redactions remain opaque before sampling.
- A successful desktop screenshot replaces the current image, annotations, selection,
  and undo history without a discard prompt. It reuses and restores the main editor window.
  A canceled or failed capture keeps the current document. Import and Quit confirmations
  remain unchanged. Duplicate pending capture requests must not create additional pickers.
- With V/select active, Shift-click toggles elements in a multi-selection. Selection
  overlays identify every selected element. Delete/Backspace removes the selected set in
  one history operation, and text editing retains normal keyboard behavior.

## Implementation boundaries

- Keep shadows in source-pixel coordinates so zoom and PNG export agree. Share shadow
  settings between rendering and document bounds; preserve cache invalidation and the
  preview-only blur optimization. Shadow decoration must never reveal masked content.
- Remove the screenshot-only frontend replacement confirmation. Native tray capture must
  not reveal the previous editor before the picker; completion restores the same window.
  Preserve the compositor hide delay when needed to avoid capturing the editor itself.
- Store selection separately from document history. Single-element editing and resize
  continue working; multi-delete commits one document, not one commit per element.

## Verification checklist

- [x] Reproduce missing behavior with failing tests before implementation.
- [x] Verify Off/Soft/Hard pixels, persistence, zoom, bounds, export, and privacy.
- [x] Verify prompt-free repeated screenshot replacement, cancel/error, and pending guards.
- [x] Verify Shift selection, group deletion, undo/redo, and typing-field exclusions.
- [x] Review implementation and run unit, desktop browser, extension, and native checks.
- [x] Update the separate desktop README and build the Linux package.

Verified: 311 unit tests, 176 desktop browser tests (Chromium/WebKit), 41 extension
tests, and 31 Rust tests passed. Two native Chrome capture tests remain skipped by
the existing test configuration. Typecheck, lint, formatting, extension build,
Rust formatting, and the unsigned Linux `.deb` build passed. Native screenshot
picker/tray interaction and macOS packaging were not manually exercised in this turn.

Review also caught unnecessary cropped pen-bound calculations in shadow privacy
checks. A failing browser traversal-count test reproduced the extra work; skipping
those checks when no redactions exist restored the ordinary rendering cost.

The work is kept in the current workspace; no commit or branch integration is requested.
