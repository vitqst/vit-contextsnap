# ContextSnap

A Chrome extension for turning screenshots into clear visual feedback. Capture a page,
draw expressive arrows, and copy the finished image into a chat, issue, or document.
All processing and image storage stay on your device.

## Install in Chrome

```sh
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's `.output/chrome-mv3` directory.
3. Pin ContextSnap in the extensions menu, open a website, then click its icon.
4. Choose **Select an area** or **Visible page**. The editor opens in a new tab.

No server, API key, account, or permanent access to websites is required. Use a recent Node.js
release (22.12+, 24+, or 26+) and Chrome 120 or later. The current package is Chrome MV3;
other Chromium browsers are not yet independently tested.

## Editor tools

- Visible and area capture, with resize handles, keyboard nudging, and cancellation.
- Locked screenshot background and a compact editor inspired by Excalidraw.
- Lightly sketchy or clean arrows. Drag either endpoint or the middle bend handle;
  double-click an arrow to add a label. Labels wrap, stay within the image/crop, and have
  their own font size. Drag a label or its corner handle to move it; Reset label position
  returns it beside the curve (above, or below when close to the top edge). Very long labels
  are shortened with an ellipsis in the image;
  the full text remains editable in the current session.
- Step circles: click repeatedly for (1), (2), (3); select to edit the number or size.
- Circular magnifier: click to place a lens or drag from its center to set the size;
  move it to enlarge another detail. Adjust its size and magnification in the left panel.
- Blur: drag a region, then adjust strength. Use Redact for sensitive information.
- Pen, rectangle, text, opaque redaction, crop, editor zoom, and 100-step undo/redo.
- Recolor, adjust thickness, move, duplicate, or delete selected objects.
- Copy flattened PNGs directly to the clipboard; download PNG as a fallback.
- Import/paste/drop PNG, JPEG, or WebP files. Importing a new image asks before replacing
  work that has not been copied or downloaded.
- Recent exports in the popup, with individual removal and Clear all.

The approved scope is documented in [the design](docs/plans/2026-09-15-screenshot-editor-design.md).
The [original requirements](docs/spec/20260915-init-requirement.md) remain the longer-term
backlog. Live-page annotations/text output, full-page capture, advanced brush tools,
localization, and Web Store publication are deferred.

## Shortcuts

| Action                                                  | Shortcut                                    |
| ------------------------------------------------------- | ------------------------------------------- |
| Open popup                                              | Alt+Shift+S                                 |
| Select area                                             | Ctrl+Shift+1 (Cmd+Shift+1 on macOS)         |
| Capture visible page                                    | Alt+Shift+V                                 |
| Select / Arrow / Pen / Rectangle / Text / Redact / Crop | V / A / P / R / T / X / C                   |
| Step / Magnifier / Blur                                 | S / M / B                                   |
| Straight arrow or square rectangle                      | Hold Shift while drawing                    |
| Undo / Redo                                             | Ctrl+Z / Ctrl+Shift+Z (Cmd on macOS)        |
| Copy image                                              | Ctrl+C (Cmd on macOS)                       |
| Finish inline text                                      | Ctrl+Enter (Cmd on macOS), or click outside |
| Delete selected object                                  | Delete or Backspace                         |
| Duplicate selected object                               | Ctrl+D (Cmd on macOS)                       |
| Move selected object                                    | Arrow keys; hold Shift for 10 pixels        |
| Fit to screen                                           | Ctrl+0 (Cmd on macOS)                       |
| Zoom                                                    | Ctrl/Cmd+scroll or zoom buttons             |
| Cancel gesture / exit area selection                    | Escape                                      |

On macOS, extension shortcuts use Option instead of Alt. Browser or OS shortcuts can
conflict; change extension shortcuts at `chrome://extensions/shortcuts`.

## Privacy and data lifetime

- No telemetry, remote fonts, network services, or automatic uploads.
- Capturing runs only after an explicit extension action. Area-selection UI is removed
  after confirmation or cancellation; there is no always-on content script.
- Temporary original captures are held in extension IndexedDB for handoff, then consumed
  when the editor opens. At most five abandoned captures are retained for up to an hour
  and pruned on the next storage operation. Editor originals and undo history live in RAM.
- Recent stores **only flattened exported images**, capped at 20 images and a shared
  100 MB storage budget. It retains the originating title/URL and capture time locally.
- Redact paints solid black into exported pixels. Original source pixels and drawing
  objects are never embedded in exported PNGs. Undo can restore the original while the
  current editor is open; it cannot restore it from a flattened Recent export.
- Blur softens details but is **not secure redaction**. Magnifiers sample the blurred/
  redacted screenshot, regardless of tool creation order. Solid redaction stays above
  magnifiers, so adding a lens cannot uncover masked source details.
- Copy and Download export the current canvas crop without selection handles or UI.
  Closing/reloading the editor discards its editable session; copy or download first.
- Removing the extension clears its local data. Browser storage can also be evicted;
  download anything you need to keep permanently.

## Development and verification

```sh
npm run dev           # WXT development extension
npm run check         # TypeScript, ESLint, formatting, unit tests, production build
npx playwright install chromium
npm run test:e2e      # Packaged-extension editor checks in isolated Chromium
npm run zip           # Chrome ZIP package in .output/
```

See [browser verification](tests/README.md) for the full suite, including actual Chrome
capture through native shortcuts. Tests use disposable profiles, never your normal
browser. The CI workflow runs the complete Linux capture suite.

### Code layout

```text
entrypoints/       Chrome background, on-demand area script, popup/editor HTML
src/core/          Versioned object model, geometry, immutable history
src/editor/        Canvas renderer, pointer handling, React editor and controls
src/export/        Flattening, clipboard, PNG download, image size limits
src/platform/      Chrome APIs, capture authority, pixel cropping, IndexedDB
src/popup/         Capture actions and local Recent list
src/ui/            Shared controls, brand and design tokens
tests/            Browser tests and deterministic local fixture pages
```

Coordinates stay in source-image pixels; editor zoom is a separate CSS transform.
Arrow seeds are fixed per object. The canvas renderer is shared by preview and export,
while selection is rendered in a separate overlay. WXT owns extension bundling;
Rough.js and perfect-freehand own stroke primitives.

To add a drawing tool, extend the discriminated object union, pure geometry and renderer,
then add its interaction and control. Cover geometry with unit tests and validate exported
pixels in the browser. Do not put Chrome API calls inside geometry or renderer modules.

To update the toolbar artwork, edit `public/icon.svg` then run
`node scripts/generate-icons.mjs` (requires the Playwright Chromium installed above).

## Limits

Capture supports ordinary HTTP/HTTPS pages. Chrome settings, extension pages, the Chrome
Web Store, and file URLs show an explicit unsupported message. Images are limited to
32 megapixels and 16,384 pixels per side. Imported files are limited to 50 MB.
Very large or corrupt images report errors. Clipboard failures leave the editor usable
with Download PNG available. Local editing is intended for desktop-sized windows.
