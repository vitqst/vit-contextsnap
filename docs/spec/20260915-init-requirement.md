# Product Requirements: Snap & Annotate for AI Agents

> **Historical, superseded draft — not release guarantees.** The [README](../../README.md)
> and [approved design](../plans/2026-09-15-screenshot-editor-design.md) describe the shipped
> extension. Several features, permissions, and browser-support claims below are proposals
> only. In particular, blur is **not secure redaction**, and screenshots do **not**
> automatically exclude passwords or personal data. Use solid Redact and review exports.
> The original draft body is retained as backlog and design history.

**Type:** Browser extension (Chrome / Chromium-based: Chrome, Edge, Brave, Arc)
**Version:** 1.2 draft
**Status:** Proposed

**Changelog:**
- **1.2** — Added technical notes on maintainability (component architecture / atomic design, state ownership, object-model versioning, coding standards), performance engineering techniques, testing strategy, error handling, and build/release (§7.2.1, §7.5–§7.8).
- **1.1** — Arrow tool redesigned as hand-drawn/sketchy with an auto-curve and an optional attached text label (§3.2.1, ED-4). Added a Select tool for re-editing placed objects, with full handle-based reshaping for arrows (§3.2.1, ED-12; §3.2.2). See acceptance criteria 10–11.

---

## 1. Overview

Developers and QA engineers often need to show an AI coding agent (Claude Code, Cursor, Copilot, etc.) *what* is wrong on a web page. Today this means taking a screenshot in one tool, marking it up in another, then writing a long description of which element they mean.

This extension removes that friction. It offers two actions from the toolbar:

1. **Screenshot**: capture part or all of a page, draw on it with freehand tools similar to Telegram's photo editor, then copy it in one click.
2. **Annotate**: click elements on the live page, attach a comment to each, and copy a structured, agent-ready prompt. The prompt includes selectors, text, and position data, so the agent can locate the exact element in code.

### 1.1 Goals

- Take a user from "I see a problem" to "context is in my AI agent's input" in under 10 seconds.
- Produce output an AI agent can act on without follow-up questions: the exact element, its location, and what should change.
- Keep all data local by default. Nothing leaves the browser unless the user copies or exports it.

### 1.2 Non-goals (v1)

- Video or GIF recording.
- Cloud storage, sharing links, or team workspaces.
- Firefox and Safari support (planned for v2).
- Directly sending output to an agent. v1 uses the clipboard; a local bridge is planned for v2 (see §9).
- Resize or recolor of an already-placed object via the Select tool (move and delete are in scope; see §3.2.2).

### 1.3 Target users

- Front-end and full-stack developers working with AI coding agents.
- QA testers reporting UI bugs.
- Designers giving visual feedback on staging builds.

---

## 2. Entry Points

### 2.1 Toolbar popup

Clicking the extension icon opens a compact popup with **two primary buttons**:

| Button | Icon | Action |
|---|---|---|
| **Screenshot** | Camera | Expands to show capture modes (§3.1) |
| **Annotate** | Speech bubble with pin | Starts element annotation mode on the current tab (§4) |

Below the buttons, the popup shows:
- Shortcut hints for each action.
- A link to **Settings**.
- A **Recent** list with the last 5 captures (thumbnails, stored locally), so the user can re-copy them.

### 2.2 Keyboard shortcuts (defaults, user-configurable via `chrome://extensions/shortcuts`)

| Action | Windows / Linux | macOS |
|---|---|---|
| Open popup | `Alt+Shift+S` | `Option+Shift+S` |
| Capture selected area | `Alt+Shift+A` | `Option+Shift+A` |
| Capture full page | `Alt+Shift+F` | `Option+Shift+F` |
| Start annotation mode | `Alt+Shift+N` | `Option+Shift+N` |
| Exit any mode | `Esc` | `Esc` |

### 2.3 Context menu

Right-clicking a page shows **Snap & Annotate → Capture area / Capture full page / Annotate this element**. "Annotate this element" starts annotation mode with the right-clicked element pre-selected.

---

## 3. Screenshot Feature

### 3.1 Capture modes

| ID | Mode | Behavior |
|---|---|---|
| SS-1 | **Select area** | Page dims. The user drags a rectangle. Live width × height in CSS pixels is shown next to the cursor. Handles allow resizing before confirming. `Enter` or double-click confirms; `Esc` cancels. |
| SS-2 | **Visible area** | Captures the current viewport immediately. |
| SS-3 | **Full page** | Scrolls and stitches the entire scrollable page (see §3.4). A progress indicator is shown. |
| SS-4 | **Element** | Hover highlights DOM elements (same picker as §4.2). Click captures that element's bounding box, including off-screen portions. |
| SS-5 | **Delayed capture** | 3s / 5s / 10s countdown before a visible-area capture, for hover states, dropdowns, and tooltips. |

**Selection helpers (SS-1):**
- Snap to element edges when the drag edge is within 8px of a visible element boundary (hold `Alt` to disable snapping).
- Hold `Shift` to lock a square aspect ratio.
- Arrow keys nudge the selection by 1px; `Shift+Arrow` by 10px.

### 3.2 Editor

After capture, the image opens in a full-screen editor overlay (injected into the page inside a Shadow DOM) or a dedicated extension tab if the page blocks injection.

**Layout:**
- Canvas centered, fit-to-screen by default, with zoom (`Ctrl/Cmd + scroll`, `Ctrl/Cmd + 0` to fit).
- Bottom toolbar with drawing tools, in the style of Telegram's photo editor.
- Right side: color palette and brush size slider.
- Top bar: Undo, Redo, Crop, Cancel, and the primary **Copy** button.

#### 3.2.1 Drawing tools

| ID | Tool | Requirements |
|---|---|---|
| ED-1 | **Pen** | Smooth freehand strokes. Points are smoothed (e.g. Catmull-Rom or quadratic Bézier) so lines look natural rather than jagged. Pressure sensitivity when a stylus or pen tablet reports pressure. |
| ED-2 | **Marker / Highlighter** | Semi-transparent (≈40% opacity), wide, flat-ended stroke. Overlapping parts of a **single** stroke must not darken. |
| ED-3 | **Neon** | Bright core stroke with an outer glow, as in Telegram. |
| ED-4 | **Arrow** | Hand-drawn, sketchy stroke rendering (a jittered double-pass line and a hand-drawn arrowhead, not a crisp vector line or a solid filled triangle) with a natural auto-curve; curvature scales with the drag length. Holding `Shift` draws a straight arrow instead. After the arrow is placed, an inline text field appears so the user can attach an optional label (leave blank to skip). Fully re-editable with the Select tool (ED-12): the start point, end point, curve-control point, and label can each be dragged independently after placement to reshape the arrow or move the label. |
| ED-5 | **Shapes** | Rectangle, ellipse, straight line. Outline or filled toggle. `Shift` constrains to square / circle / 45° angles. |
| ED-6 | **Shape recognition** | Optional (on by default): if the user draws a rough rectangle, circle, or arrow and holds still for ~500ms at the end, it snaps into a clean shape, as Telegram does. |
| ED-7 | **Text** | Click to place a text box. Styles: plain, outlined, filled background. Font size adjustable. Text can be moved, edited, and deleted after placing (via the Select tool, ED-12 — double-click to re-open the text for editing). |
| ED-8 | **Numbered step marker** | Click to place a circle containing an auto-incrementing number (1, 2, 3…). Useful for "fix these in order" instructions. |
| ED-9 | **Blur / Pixelate** | Drag a rectangle to obscure sensitive content such as emails, tokens, and personal data. This effect must be **baked into the pixels** on export and must not be reversible. |
| ED-10 | **Eraser** | Removes whole strokes or objects on touch (object eraser), not individual pixels. |
| ED-11 | **Crop** | Crop the capture after the fact, with free and fixed aspect ratios. |
| ED-12 | **Select / Move** | The re-edit tool. Clicking an object selects it (shown with a dashed outline). Dragging the object's body moves it; `Delete`/`Backspace` removes it. Arrows get extra handles when selected — draggable start, end, and curve-control points, plus a label handle when a label is present — so the arrow's shape and label position can be adjusted after the fact without redrawing it. Double-clicking a selected arrow's label, or a selected text object, re-opens it for text editing. Selection handles are UI-only: they render live on screen but are hidden for the instant a Copy, Copy for AI, or Download action reads the canvas, so they never appear in the exported image. |

#### 3.2.1a Hand-drawn rendering

Pen, Marker, Neon, and Arrow strokes render with a hand-drawn, sketchy quality rather than as perfectly smooth vector lines: each stroke is drawn as two overlapping passes with a small random jitter along the path. Each stroke (and each arrowhead) uses a fixed per-object random seed so the jitter pattern is stable across redraws and identical in the exported image — it must not look different or "vibrate" between the on-screen preview and the copied/downloaded result.

#### 3.2.2 Tool settings

- **Colors:** 8 preset swatches (red, orange, yellow, green, blue, purple, black, white) plus a custom color picker. The last-used color is remembered.
- **Brush size:** a vertical slider with a live preview dot, as in Telegram.
- **Object editing:** every stroke and shape is stored as a vector object. The Select tool (ED-12) lets users move or delete any object. Arrows additionally support full shape editing — independently draggable start, end, and curve-control handles, plus the optional text label — and text objects support re-opening for text editing. Resize and recolor of an already-placed object are out of scope for v1 (see §1.2).
- **Undo / Redo:** at least 50 steps. Shortcuts: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`.

### 3.3 Output actions

| ID | Action | Behavior |
|---|---|---|
| OUT-1 | **Copy image** (primary) | Copies a flattened PNG to the clipboard. Shortcut: `Ctrl/Cmd+C` when no text box is being edited. Shows a "Copied" toast. |
| OUT-2 | **Copy for AI** | Copies the PNG **and** a text block with capture metadata (see §3.5). If the target app only accepts one clipboard type, the image takes priority and the text is available via a second button. |
| OUT-3 | **Download** | Saves as PNG (default), JPEG, or WebP. File name pattern is configurable; default is `{hostname}_{yyyy-MM-dd_HH-mm-ss}.png`. |
| OUT-4 | **Save to Recent** | Every copied or downloaded capture is saved to the local Recent list (max 20, oldest removed first). |

After a successful copy, the editor stays open (setting: "Close editor after copy", default off).

### 3.4 Full-page capture requirements

Full-page capture is the most error-prone feature and needs specific handling:

- **Stitching:** scroll by viewport height, capture each segment with `chrome.tabs.captureVisibleTab`, and stitch on an offscreen canvas.
- **Rate limit:** Chrome limits `captureVisibleTab` to about 2 calls per second. The scroller must throttle to stay within this limit.
- **Fixed and sticky elements:** after the first segment, temporarily hide `position: fixed` and `position: sticky` elements so headers and chat widgets don't repeat in every segment. Restore them afterward.
- **Lazy-loaded content:** wait for network idle or up to 500ms per segment so lazy images can load.
- **Inner scroll containers:** if the page body doesn't scroll but a main container does (common in SPAs), detect the largest scrollable element and scroll that instead.
- **Size limits:** browsers cap canvas size (roughly 32,767px per side and a total area limit). If a page exceeds this, warn the user and offer to (a) reduce scale, or (b) split the capture into multiple images.
- **Restore state:** return the page to its original scroll position when finished or cancelled.
- **High-DPI:** capture at device pixel ratio by default, with a setting to export at 1× for smaller files.

### 3.5 Capture metadata ("Copy for AI")

```markdown
## Screenshot context
- URL: https://staging.example.com/checkout?step=2
- Page title: Checkout – Example
- Captured: 2026-09-15 14:32 (GMT+7)
- Viewport: 1440 × 900 @2x
- Capture mode: Select area
- Region (page coordinates): x=320, y=1180, w=640, h=410
- Annotations drawn: 2 arrows, 1 text ("Button misaligned"), 3 step markers
```

Text written with the Text tool, and any label attached to an arrow, is included in the metadata as plain text, so the agent can read it even if its image understanding is weak.

---

## 4. Annotate Feature

### 4.1 Purpose

Annotate lets users point at real DOM elements and leave comments. The output is a structured prompt that tells an AI agent exactly which elements are involved and what to change, with enough identifying data for the agent to find them in the source code.

### 4.2 Element picker

| ID | Requirement |
|---|---|
| AN-1 | When annotation mode starts, a floating toolbar appears (draggable; defaults to bottom-center). The page stays interactive for hovering but clicks are intercepted. |
| AN-2 | Hovering an element draws a highlight overlay (margin, border, padding, and content boxes, similar to browser DevTools) plus a small label showing `tag.class#id` and its size. |
| AN-3 | **Navigate the DOM tree** while hovering: `↑` selects the parent, `↓` selects the first child, `←`/`→` select siblings. This solves the "can't click the wrapper" problem. |
| AN-4 | Clicking an element selects it and opens a **comment popover** next to it. |
| AN-5 | `Shift+Click` adds multiple elements to one annotation (e.g. "these three cards should be the same height"). |
| AN-6 | **Area annotation:** hold `Alt` and drag to annotate a region instead of an element (for gaps, spacing, or empty areas). |
| AN-7 | A **Pause** toggle (shortcut `P`) temporarily lets clicks reach the page, so the user can open menus or modals and then continue annotating. |
| AN-8 | The picker ignores the extension's own UI and works inside same-origin iframes. Cross-origin iframes are annotated as a single element, with a note that their contents are inaccessible. |
| AN-9 | Elements inside open Shadow DOM are selectable; the selector output indicates the shadow boundary. |

### 4.3 Comment popover

- A multi-line text field that auto-focuses. `Ctrl/Cmd+Enter` saves; `Esc` cancels.
- An optional **type** tag: `Bug`, `Change`, `Question`, `Style`, `Content`. Defaults to `Change`.
- An optional **priority**: Low / Medium / High.
- A checkbox **"Include element screenshot"** (default on) that crops a screenshot of the element.
- Buttons: Save, Delete.

### 4.4 Annotation pins

- Each saved annotation shows a numbered pin (①, ②, ③…) at the top-right corner of its element.
- Pins follow their element on scroll, resize, and layout changes (use `ResizeObserver` and `MutationObserver`). If the element is removed from the DOM, the pin turns grey and shows a "detached" warning.
- Clicking a pin reopens its comment for editing.
- Pins can be dragged to reorder numbering.

### 4.5 Annotation panel

A collapsible side panel (right side, resizable) lists all annotations on the current page:
- Number, type tag, short element label, and first line of comment.
- Clicking an item scrolls to its element and flashes the highlight.
- Actions per item: edit, delete, re-pick element.
- Panel-level actions: **Copy for AI** (primary), Copy as JSON, Download, Clear all.
- Annotations persist per URL in local storage, so they survive a page reload. The user can clear them from the panel or settings.

### 4.6 Data captured per annotated element

| Field | Example | Notes |
|---|---|---|
| Unique CSS selector | `main > section.pricing > div.card:nth-of-type(2) > button` | Prefer stable attributes: `id`, `data-testid`, `data-test`, `aria-label`, `name`. Avoid auto-generated class names (e.g. CSS-module hashes) when possible. |
| XPath | `/html/body/main/section[2]/div[2]/button` | Fallback identifier. |
| Tag and key attributes | `<button type="submit" class="btn btn-primary">` | Trimmed. Attributes longer than 100 characters are truncated. |
| Visible text | `"Continue to payment"` | Trimmed to 200 characters. |
| Accessible role and name | `button`, `"Continue to payment"` | From the accessibility tree where available. |
| Bounding box | `x=812, y=1340, w=180, h=44` | Page coordinates and viewport coordinates. |
| Selected computed styles | `font-size, color, background-color, margin, padding, display, position` | A configurable whitelist, not all styles. |
| Framework component hint | `CheckoutButton` (React), `<checkout-step>` (Vue) | Best effort, read from React DevTools hooks or Vue internals when present. Off by default for performance; toggle in settings. |
| Source file hint | `src/components/CheckoutButton.tsx:42` | Only when the dev build exposes source info (e.g. React `_debugSource`, `data-source` attributes). |
| Outer HTML snippet | first 500 characters | Optional (setting). |
| Element screenshot | PNG crop | If "Include element screenshot" is checked. |

### 4.7 "Copy for AI" output format

The default output is Markdown, which works well in agent chat inputs and in files. A template editor in settings lets users customize it.

````markdown
# UI feedback — Checkout – Example
URL: https://staging.example.com/checkout?step=2
Viewport: 1440 × 900 · Captured 2026-09-15 14:32 (GMT+7)

Please make the following changes. Each item identifies the target element.

## 1. [Bug · High] Button is misaligned with the input field
- Element: `<button type="submit" class="btn btn-primary">` — "Continue to payment"
- Selector: `[data-testid="checkout-continue"]`
- Component hint: `CheckoutButton` (src/components/CheckoutButton.tsx:42)
- Position: x=812, y=1340, 180×44
- Styles: margin-top: 12px; padding: 10px 20px; display: inline-flex
- Comment: The button sits 4px lower than the email input next to it. Align their baselines.

## 2. [Change · Medium] (3 elements) Make the pricing cards equal height
- Elements:
  - `section.pricing > div.card:nth-of-type(1)` — "Starter"
  - `section.pricing > div.card:nth-of-type(2)` — "Pro"
  - `section.pricing > div.card:nth-of-type(3)` — "Team"
- Comment: Cards have different heights depending on feature list length. They should stretch to match the tallest one.
````

**Clipboard behavior:**
- If any annotation includes an element screenshot, "Copy for AI" offers two options: *Text only* and *Text + combined image*. The combined image is a single screenshot of the page with the numbered pins drawn on it, so the numbers in the text match the numbers in the image.
- **Copy as JSON** outputs the same data as structured JSON (schema in Appendix A) for scripts and tools.

---

## 5. Settings

| Setting | Default |
|---|---|
| Default capture mode for the shortcut | Select area |
| Image format / quality | PNG |
| Export scale | Device pixel ratio |
| File name pattern | `{hostname}_{yyyy-MM-dd_HH-mm-ss}` |
| Close editor after copy | Off |
| Shape recognition | On |
| Default pen color and size | Red, medium |
| Annotation output template | Built-in Markdown |
| Computed styles to include | Whitelist shown in §4.6 |
| Detect framework components | Off |
| Include outer HTML | Off |
| Auto-redact patterns | Off (see §6) |
| Persist annotations per URL | On |
| Theme | Follow system (light / dark) |
| Language | Follow browser (English, Vietnamese in v1) |

---

## 6. Privacy and Security

- **Local only.** No analytics or telemetry by default. No network requests except those the user explicitly triggers in future integrations.
- **Minimal permissions:** `activeTab`, `scripting`, `storage`, `clipboardWrite`, `contextMenus`, `offscreen`. Avoid `<all_urls>` host permission in v1; use `activeTab` so the extension only touches pages the user invokes it on.
- **Auto-redaction (optional):** when enabled, text matching configured patterns (emails, phone numbers, credit-card-like numbers, JWT/API-key-like strings) is blurred in screenshots and replaced with `[REDACTED]` in annotation text output. Users can add custom regex patterns.
- **Input values:** values of `<input type="password">` are never captured. Values of other inputs are excluded from annotation output by default.
- **Restricted pages:** on `chrome://` pages, the Chrome Web Store, and other pages where injection is blocked, the popup explains that capture isn't available there, instead of failing silently.

---

## 7. Technical Requirements

### 7.1 Architecture

- **Manifest V3.**
- **Service worker:** handles shortcuts, context menus, `captureVisibleTab`, and messaging.
- **Content script:** injected on demand via `chrome.scripting.executeScript`. It provides the selection overlay, element picker, pins, and annotation panel.
- **UI isolation:** all injected UI is rendered inside a **closed Shadow DOM** attached to a single host element, with a very high `z-index`. Page CSS must not affect extension UI, and extension CSS must not leak into the page.
- **Editor:** a canvas-based vector editor. Options: a lightweight custom engine, or a library such as Konva or Fabric.js. Strokes must be stored as vector objects to support object editing and undo/redo. Arrow objects additionally store a curve-control point and an optional label position/text so they can be reshaped after placement (§3.2.1, ED-12).
- **Freehand smoothing:** use a stroke library such as `perfect-freehand` for natural, pressure-aware lines. The hand-drawn jitter pass described in §3.2.1a is a separate rendering step applied on top of (or instead of) this smoothing for Pen, Marker, Neon, and Arrow.
- **Offscreen document:** used for clipboard writes and heavy canvas work (stitching) where the service worker has no DOM.
- **Suggested stack:** TypeScript, a UI framework such as React or Preact inside the Shadow DOM, and a build tool with MV3 support (e.g. WXT or Plasmo).

### 7.2 Performance

| Metric | Target |
|---|---|
| Popup open time | < 100ms |
| Overlay appears after "Select area" | < 150ms |
| Hover highlight latency | < 16ms (60fps) |
| Pen stroke input latency | < 16ms |
| Full-page capture, 10,000px tall page | < 8s |
| Content script bundle size | < 150KB gzipped |
| Memory when idle (no mode active) | No content script injected |

#### 7.2.1 Performance engineering techniques

- **Throttled live redraw:** while dragging (drawing a stroke, dragging a Select-tool handle), the canvas redraws on `requestAnimationFrame` rather than synchronously per pointer event, so a fast mouse/stylus doesn't queue up redraws faster than the screen can show them.
- **Deterministic jitter, not re-randomized:** the hand-drawn rendering (§3.2.1a) reads its jitter from a seed stored once on the object, not from a fresh random call per redraw — this keeps a full-canvas redraw cheap and prevents the sketch pattern from "vibrating" while, e.g., a Select-tool handle is being dragged.
- **Code splitting:** the screenshot editor (canvas engine, drawing tools) and the annotate-mode UI are separate bundles. A user who only ever uses Annotate never downloads or parses the editor code, and vice versa.
- **Throttled tab capture:** full-page stitching (§3.4) queues its `captureVisibleTab` calls against the ~2/sec browser limit instead of firing them in a tight loop and handling failures after the fact.
- **Listener lifecycle:** hover-highlight and pointer listeners are attached only while Annotate mode is active (and detached the instant it exits or is paused), so the "memory when idle" target above holds even within a single content-script injection, not only when nothing has been injected at all.

### 7.3 Compatibility

- Chrome and Edge, latest 3 major versions.
- Works on SPAs (React, Vue, Angular, Next.js), including after client-side route changes.
- Handles pages with strict Content Security Policy; injected UI must not rely on inline scripts or styles blocked by CSP.
- Display scaling: 100%, 125%, 150%, 200%.

### 7.4 Accessibility

- All popup and panel controls are keyboard reachable with visible focus.
- Tool buttons have tooltips and `aria-label`s.
- Highlight overlay colors meet 3:1 contrast against both light and dark pages (use a two-tone outline).

### 7.5 Maintainability

- **Component architecture (atomic design):** the UI is built from small, single-responsibility components layered as:
  - *Atoms* — icon button, color swatch, size slider, text input, toggle pill.
  - *Molecules* — the color palette (swatches + custom picker), the tool button group, the comment type/priority selects.
  - *Organisms* — the popup panel, the editor's top/bottom toolbars, the annotation panel, the comment popover.
  - *Templates* — the editor overlay layout, the annotate-mode overlay layout.
  - *Pages* — the popup, the full-screen editor, the in-page annotate experience, and the fallback extension-tab view used when injection is blocked (§3.2).
  This keeps each drawing tool (§3.2.1) and each annotation UI piece independently testable, and reusable between the in-page (Shadow DOM) UI and the fallback extension-tab UI without a rewrite.
- **State ownership:** editor state (objects, undo/redo stacks, current tool, selection) and annotate state (annotations, pins, pending group, popover) are each owned by a single store local to their own feature, not by shared globals — the two features never need to read each other's state, and either can be code-split independently (§7.2.1).
- **Object model versioning:** both the internal vector-object shape used by the editor (§7.1) and the annotation JSON schema (Appendix A) carry a version number. A schema change ships with a migration step so previously-saved `chrome.storage` data, or an imported annotation file (§11, open question 4), doesn't silently break on load — it either migrates or is reported to the user as unreadable.
- **Coding standards:** TypeScript in strict mode; ESLint + Prettier enforced in CI. No `any` in the geometry and selector-generation modules in particular — a silent type error there produces a wrong CSS selector or a malformed arrow curve rather than a build failure, which is a worse failure mode to ship.

### 7.6 Testing strategy

- **Unit tests:** the pure-function, no-DOM parts of the codebase get the highest coverage — bezier point sampling and distance-to-segment hit testing (for arrow selection and re-editing, ED-12), CSS-selector and XPath generation (§4.6), and the Markdown/JSON output builders (§3.5, §4.7, Appendix A).
- **Component tests:** each atom/molecule/organism (§7.5) is rendered and interacted with in isolation — e.g. dragging an arrow's curve handle updates its control point; typing in the comment popover and pressing `Ctrl/Cmd+Enter` saves.
- **End-to-end tests:** Playwright, run against a small fixed set of real-world-shaped fixture pages (a long marketing page, a React SPA with client-side routing, a page with a sticky header, a page containing a same-origin iframe) covering the scenarios in §8 — including full-page stitching and the select/re-edit flow (criteria 2, 10, 11).
- **Visual regression:** the flattened canvas output is snapshotted for a fixed set of drawing-tool scripts (draw arrow, add label, blur a region, place a numbered step, etc.), so an unintended rendering change is caught even on tools with no pixel-level acceptance criterion.

### 7.7 Error handling & resilience

- Every capture path (`captureVisibleTab`, full-page stitching, clipboard write) degrades gracefully instead of throwing to the user: a failed capture shows a toast and leaves the popup usable; a blocked clipboard write falls back to Download and says so, rather than appearing to silently succeed.
- No remote error reporting by default, consistent with the local-only stance in §6. An optional, off-by-default "copy diagnostic info" action assembles a local text report (extension version, browser version, last action, recent console warnings) for the user to paste into a bug report themselves — it is never sent automatically.

### 7.8 Build, versioning & release

- Semantic versioning for the extension package; each release ships with a short changelog shown in the popup the first time it opens after an update.
- CI runs lint, unit/component tests, and a production build on every PR; the Playwright e2e suite (§7.6) runs on merge to the main branch.
- Source maps are generated for local debugging but excluded from the `.zip` submitted to the Chrome Web Store.

---

## 8. Acceptance Criteria (key scenarios)

1. **Area capture and copy:** Given a page is open, when the user presses `Alt+Shift+A`, drags a region, draws a red arrow, and presses `Ctrl+C`, then a PNG with the arrow is on the clipboard and can be pasted into an AI chat input.
2. **Full page with sticky header:** Given a page with a sticky header and a 6,000px scroll height, when the user selects Full page, then the result shows the header only once and has no gaps or duplicated sections, and the page returns to its original scroll position.
3. **Blur is permanent:** Given a capture with a blurred region, when the image is exported, then the original pixels in that region cannot be recovered from the file.
4. **Telegram-style drawing:** Given the pen tool, when the user draws quickly, then the line is smooth without visible corners; when the user draws a rough circle and holds, then it becomes a clean ellipse.
5. **Annotate with DOM navigation:** Given annotation mode, when the user hovers an icon inside a button and presses `↑`, then the button itself is highlighted; clicking it opens the comment popover.
6. **Agent-ready output:** Given three annotations, when the user clicks Copy for AI, then the clipboard contains Markdown with three numbered items, each with a selector that returns exactly one element (or the listed group) via `document.querySelectorAll`.
7. **Persistence:** Given annotations on a page, when the user reloads the page, then the pins reappear on the same elements.
8. **Pins track layout:** Given a pinned element, when the window is resized and the layout reflows, then the pin moves with the element.
9. **Restricted page:** Given the user is on `chrome://settings`, when they open the popup, then the buttons are disabled with a clear explanation.
10. **Hand-drawn arrow with label:** Given the arrow tool, when the user drags from one point to another, then the result is a sketchy, slightly curved arrow (or straight, if `Shift` is held) with a hand-drawn arrowhead; releasing the drag opens an inline field to add an optional label.
11. **Re-editing an arrow:** Given a previously placed arrow, when the user selects it with the Select tool, then handles appear at its start, end, and curve-control points (and its label, if any); dragging any handle updates the arrow's shape immediately, and the handles themselves never appear in a subsequent copy or download of the image.

---

## 9. Future Scope (v2+)

- **Local agent bridge:** a local MCP server or native messaging host so an agent (e.g. Claude Code) can read the latest screenshot and annotations directly, without the clipboard.
- **Send to…** integrations: GitHub issue, Jira, Linear, Notion, Slack.
- **Console and network context:** attach recent console errors and failed requests to annotations.
- **Before/after comparison:** capture the same region twice and show a diff.
- **Screen recording** with annotations.
- **Firefox support.**
- **Resize and recolor of placed objects** via the Select tool (deferred from v1, §1.2).

---

## 10. Milestones

| Phase | Scope | Estimate |
|---|---|---|
| M1 | Extension scaffold, popup, visible and area capture, copy/download | 1 week |
| M2 | Editor: pen, marker, hand-drawn curved arrow (+ optional label), shapes, text, select/re-edit, undo/redo, crop | 2.5 weeks |
| M3 | Full-page and element capture, blur, neon, shape recognition, step markers | 1.5 weeks |
| M4 | Annotation picker, comments, pins, panel, persistence | 2 weeks |
| M5 | Copy for AI (Markdown/JSON), templates, settings, redaction | 1 week |
| M6 | QA across sites, performance tuning, i18n, store submission | 1 week |

---

## 11. Open Questions

1. Should "Copy for AI" for annotations default to including the combined pinned screenshot, or text only, to keep token usage low?
2. Is Vietnamese localization required at launch, or can it follow in a minor release?
3. Which agent should the v2 local bridge target first?
4. Should annotations be exportable/importable as a file so they can be shared with teammates before cloud features exist?
5. Should the hand-drawn jitter amount (§3.2.1a) be a user-adjustable setting, or fixed per tool?
6. Is move-and-delete-only object editing (§1.2, §3.2.2) sufficient for v1, or do testers need resize/recolor of placed shapes and text sooner than v2?

---

## Appendix A: Annotation JSON schema (draft)

```json
{
  "version": "1.0",
  "page": {
    "url": "string",
    "title": "string",
    "capturedAt": "ISO-8601 string",
    "viewport": { "width": 0, "height": 0, "devicePixelRatio": 0 }
  },
  "annotations": [
    {
      "index": 1,
      "type": "bug | change | question | style | content",
      "priority": "low | medium | high | null",
      "comment": "string",
      "kind": "element | area",
      "area": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "elements": [
        {
          "selector": "string",
          "xpath": "string",
          "tag": "string",
          "attributes": { "key": "value" },
          "text": "string",
          "role": "string",
          "accessibleName": "string",
          "rect": { "x": 0, "y": 0, "width": 0, "height": 0 },
          "styles": { "property": "value" },
          "componentHint": "string | null",
          "sourceHint": "string | null",
          "outerHtml": "string | null",
          "screenshot": "data:image/png;base64,... | null"
        }
      ]
    }
  ]
}
```
