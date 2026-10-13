# Add Screenshot Layer Design

## Goal

Allow a desktop user who is already editing a screenshot to capture another screenshot and add it to the current document as a movable image layer.

## User experience

The existing **Capture** button, `Ctrl/Cmd+Shift+S` shortcut, and tray Screenshot action continue to replace the current document. When an image is open in the desktop editor, the header also shows **Add screenshot** beside **Add image**. Selecting it opens the operating system screenshot picker. A successful capture is centered in the current document and selected so it can immediately be moved or resized.

The inserted screenshot behaves exactly like an imported image layer: it participates in layer ordering, annotations, magnifiers, privacy effects, undo/redo, copy, and PNG export. Canceling the system picker makes no document change. Capture or decode failures leave the existing document and history intact and show an actionable error.

## Architecture and data flow

No native command or platform interface is added. The new action reuses `EditorPlatform.captureScreenshot()`, extracts the returned PNG `Blob`, and passes it through the editor's existing image-layer insertion path. That path owns image validation, asset storage, placement, document-size validation, selection, history, and success messaging.

The editor uses a distinct pending flag for an add-screenshot capture so its progress message is unambiguous while existing replacement-capture behavior remains unchanged. All document mutation is locked while the native picker or subsequent image decoding is pending. The action is exposed only when the platform supports native capture and a base image is already open.

## Testing

Desktop Playwright coverage will verify successful insertion, selected image-layer controls, undo/redo, cancellation, native failures, and pending-state locking. Existing replacement-capture tests remain unchanged and protect the distinction between **Capture** and **Add screenshot**. The normal typecheck, lint, formatting, unit-test, desktop browser-test, and production-build checks will run before completion.
