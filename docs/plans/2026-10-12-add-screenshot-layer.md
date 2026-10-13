# Add Screenshot Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a desktop editor action that captures another screenshot and inserts it into the current document as an editable image layer.

**Architecture:** Reuse the desktop platform's existing `captureScreenshot()` method and the editor's existing image-layer insertion pipeline. Keep replacement capture and tray/keyboard behavior untouched, while a separate header action owns add-capture pending state and messaging.

**Tech Stack:** React 19, TypeScript, Tauri 2 IPC, Playwright desktop tests, Vitest

---

### Task 1: Specify successful screenshot-layer insertion

**Files:**

- Modify: `tests/desktop/editor.spec.ts`
- Modify: `src/editor/EditorHeader.tsx`
- Modify: `src/editor/Editor.tsx`

**Step 1: Write the failing test**

Add a desktop test that opens a base capture, clicks a header button named `Add screenshot`, and expects a second `capture_screenshot` call, one selected image object, an unchanged base canvas, and working undo/redo.

**Step 2: Run test to verify it fails**

Run: `npx playwright test tests/desktop/editor.spec.ts --config playwright.desktop.config.ts --project chromium -g "adds another screenshot"`

Expected: FAIL because the `Add screenshot` button does not exist.

**Step 3: Write minimal implementation**

Add an optional `onAddScreenshot` prop to `EditorHeader` and render a camera-plus action only for open documents. In `Editor`, add an `addScreenshot()` handler that calls `platform.captureScreenshot()` and sends a successful record's `image` through the existing `addImage()` behavior without invoking replacement capture.

**Step 4: Run test to verify it passes**

Run the same Playwright command.

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/desktop/editor.spec.ts src/editor/EditorHeader.tsx src/editor/Editor.tsx
git commit -m "feat(desktop): add screenshot as image layer"
```

### Task 2: Preserve work across cancellation, failure, and pending capture

**Files:**

- Modify: `tests/desktop/editor.spec.ts`
- Modify: `src/editor/Editor.tsx`

**Step 1: Write the failing tests**

Add focused desktop tests showing that canceled and failed add-screenshot requests preserve the current objects and undo history, and that a pending request makes the editor workspace inert and ignores mutation shortcuts.

**Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/desktop/editor.spec.ts --config playwright.desktop.config.ts --project chromium -g "added screenshot"`

Expected: at least one FAIL because add-capture-specific pending and error handling is incomplete.

**Step 3: Write minimal implementation**

Track add-screenshot capture separately from replacement capture, guard both operations against simultaneous requests, retain the document on null/error results, and display `Capturing screenshot to add…` until capture and insertion finish.

**Step 4: Run tests to verify they pass**

Run the same Playwright command.

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/desktop/editor.spec.ts src/editor/Editor.tsx
git commit -m "test(desktop): cover screenshot layer failures"
```

### Task 3: Document and verify the desktop workflow

**Files:**

- Modify: `desktop/README.md`

**Step 1: Update documentation**

Document the **Add screenshot** action and clarify that **Capture**, the keyboard shortcut, and the tray action still replace the document.

**Step 2: Run focused checks**

Run:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright test tests/desktop/editor.spec.ts --config playwright.desktop.config.ts --project chromium
```

Expected: all PASS with no warnings introduced by the feature.

**Step 3: Run the production build**

Run: `npm run desktop:build:web`

Expected: PASS and a completed Vite desktop bundle.

**Step 4: Commit**

```bash
git add desktop/README.md
git commit -m "docs(desktop): explain screenshot layers"
```
