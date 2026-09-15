# ContextSnap: screenshot-first v0.1

This document records the scope approved in the conversation on September 15, 2026.
It takes precedence over the broader v1.2 draft where they differ.

## Approved experience

- Chrome Manifest V3 extension. Capture the visible viewport or select an area.
- Area shortcut: Ctrl+Shift+1 (Cmd+Shift+1 on macOS). Chrome left the proposed
  Alt+Shift+A and Alt+Shift+R unassigned during native browser testing. Popup hints
  read Chrome's actual assigned shortcuts, including user customizations.
- Open the captured screenshot in a dedicated extension editor tab.
- Keep the screenshot locked underneath editable drawing objects.
- Compact toolbar: Select, Arrow, Pen, Rectangle, Text, Redact. Crop, zoom, undo/redo.
- Lightly sketchy arrows by default, with a clean-style toggle. Natural quadratic curve;
  Shift creates a straight arrow. Independently move the start, end and curve handle.
- Move an arrow by dragging its body. Double-click to add/edit a label; labels follow
  arrow geometry and can also be repositioned. Color and thickness can be edited.
- Copy image writes a flattened PNG to the clipboard. Download provides a PNG fallback.
- Selection handles and editor UI are drawn on a separate layer, never exported.
- Local Recent contains flattened exported images only. Captures are temporary; the
  extension has no telemetry or remote services.
- Import/paste a local image is a useful secondary entry into the same editor.

## Architecture

WXT handles Chrome packaging and entrypoints, React handles editor/popup controls,
and Canvas handles image composition. Rough.js and perfect-freehand provide drawing
primitives. Each object stores a fixed seed so its appearance is stable on redraw/export.

- `entrypoints/`: thin Chrome and HTML entrypoints.
- `src/platform/`: Chrome capture, area selection, versioned IndexedDB image storage.
- `src/core/`: typed object model, pure geometry, document history.
- `src/editor/`: pointer interactions, canvas renderer, reusable controls and editor layout.
- `src/export/`: flattening, PNG clipboard/download, safe filenames.

All editor coordinates use source-image pixels. CSS scale is a view transform. The
background handles captures, the content script only performs on-demand area selection,
and the editor performs clipboard writes directly following the user's action.

## Reliability

- Rate-limit captures, validate active tab before capture, and reject changed viewport
  geometry during selection. Remove selection UI before reading screen pixels.
- Clean up area-selection listeners and nodes on cancellation or completion.
- Use opaque redaction, not blur, for sensitive regions. Recent stores only the flattened
  result; original captures are consumed by the editor and not retained as history.
- Crop is part of undoable document state. Export uses an independent canvas.
- Keep at least 50 undo steps; canvas pointer movement commits once at the end of a gesture.
- Store image blobs in IndexedDB, not base64 in chrome.storage. Bound retention by count
  and bytes; report storage and clipboard errors honestly.

## Validation

Unit tests cover curve geometry, arrow handles, object hit testing, history, capture crop
conversion, storage retention, and export metadata. Browser tests exercise the packaged
MV3 extension: capture, arrows, labels, editing, undo, crop, redaction, and PNG export.
Inspect the editor visually and request an independent implementation review.

## Deferred

Live-page annotations and Markdown/JSON page feedback; full-page/element/delayed capture;
automatic recognition, neon/highlighter, localization, framework detection,
sharing/import of editable documents, and Web Store publication. Source requirements
remain in `docs/spec/20260915-init-requirement.md` as the longer-term backlog.

## Approved v0.2 refinement

The user requested these additions after trying the first release, and explicitly
confirmed that the magnifier belongs in the exported screenshot, not just the editor view.

- Arrow labels wrap words and long unbroken text in a bounded, readable badge. Font size
  is independent of arrow thickness. Labels start above the curve (below when the top edge
  leaves insufficient room) and stay inside the
  image/current crop; drag the label itself to reposition it. Keep the full editable text
  when an exceptionally long label needs an ellipsis in the image.
- Step: click repeatedly to add numbered circles (1), (2), (3). Number new and duplicated
  steps after the highest existing number. Steps remain movable and undoable.
- Magnifier: place a circular lens on the screenshot, adjust its size and magnification,
  and move it to enlarge another detail. Existing editor zoom remains separate.
- Blur: drag a region and adjust its strength. Blur is cosmetic; use solid Redact for
  sensitive information. Magnifiers sample the already blurred/redacted screenshot,
  never an uncovered original beneath a privacy effect.
- All additions use the same source-pixel scene and renderer for preview, clipboard,
  PNG download, and cropped export. No new Chrome permissions or services.
