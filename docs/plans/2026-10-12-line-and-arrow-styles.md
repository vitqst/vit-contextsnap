# Line Tool and Arrow Styles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an editable Shift-snapped Line tool and configurable one-way/two-way Standard/Bold arrows.

**Architecture:** Introduce first-class line data and pure shared geometry for snapping and arrow silhouettes. Wire those primitives through the shared editor model, canvas gestures, renderer, properties, hit testing, bounds, and export while keeping missing arrow appearance fields backward compatible.

**Tech Stack:** TypeScript, React 19, Canvas 2D, Rough.js, Vitest, Playwright

---

### Task 1: Add line and arrow appearance geometry

**Files:**

- Create: `src/core/line.ts`
- Create: `src/core/line.test.ts`
- Create: `src/core/arrow-shape.ts`
- Create: `src/core/arrow-shape.test.ts`
- Modify: `src/core/model.ts`
- Modify: `src/core/geometry.ts`
- Modify: `src/core/geometry.test.ts`

**Step 1: Write failing geometry tests**

Specify `snapLinePoint(origin, point)` at 0°, 45°, and 90° while preserving length; line movement, hit testing, and bounds; legacy arrow defaults; start/end Standard heads; and closed Bold polygons for straight and curved arrows.

**Step 2: Verify RED**

Run: `npx vitest run src/core/line.test.ts src/core/arrow-shape.test.ts src/core/geometry.test.ts`

Expected: FAIL because `LineObject`, `snapLinePoint`, and arrow-shape helpers do not exist.

**Step 3: Implement minimal pure geometry**

Add:

```ts
export interface LineObject extends ObjectBase {
  type: 'line';
  start: Point;
  end: Point;
}

export interface ArrowObject extends ObjectBase {
  // existing fields...
  direction?: 'one-way' | 'two-way';
  appearance?: 'standard' | 'bold';
}
```

Implement nearest-`Math.PI / 4` snapping, endpoint-aware Standard heads, and a sampled filled Bold outline that follows `arrowControl()`.

**Step 4: Verify GREEN**

Run the same Vitest command and expect all targeted tests to pass.

**Step 5: Commit**

```bash
git add src/core/model.ts src/core/line.ts src/core/line.test.ts src/core/arrow-shape.ts src/core/arrow-shape.test.ts src/core/geometry.ts src/core/geometry.test.ts
git commit -m "feat(editor): add line and arrow shape geometry"
```

### Task 2: Build the editable Line tool

**Files:**

- Create: `tests/desktop/line-and-arrow-styles.spec.ts`
- Modify: `src/editor/Toolbar.tsx`
- Modify: `src/editor/Editor.tsx`
- Modify: `src/editor/DrawingCanvas.tsx`
- Modify: `src/editor/Properties.tsx`
- Modify: `src/editor/render.ts`

**Step 1: Write failing desktop tests**

Test that **Line (L)** is available, `L` selects it, an ordinary drag keeps a free angle, Shift-drag snaps to 45°, the selected line exposes two endpoint handles, and Shift-moving an endpoint snaps around the opposite endpoint.

**Step 2: Verify RED**

Run: `npx playwright test tests/desktop/line-and-arrow-styles.spec.ts --config=playwright.desktop.config.ts --project=chromium -g "Line"`

Expected: FAIL because the Line toolbar action is absent.

**Step 3: Implement minimal editor integration**

Add `line` to `Tool`, toolbar position/shortcut/hint/style controls, two-point drawing, endpoint handles, movement, selection, clean/sketch rendering, and Shift snapping during creation and handle edits.

**Step 4: Verify GREEN**

Run the same Playwright command and the targeted core tests; expect PASS.

**Step 5: Commit**

```bash
git add tests/desktop/line-and-arrow-styles.spec.ts src/editor/Toolbar.tsx src/editor/Editor.tsx src/editor/DrawingCanvas.tsx src/editor/Properties.tsx src/editor/render.ts
git commit -m "feat(editor): add Shift-snapped line tool"
```

### Task 3: Render and edit arrow direction and style

**Files:**

- Modify: `tests/desktop/line-and-arrow-styles.spec.ts`
- Modify: `src/editor/Properties.tsx`
- Modify: `src/editor/render.ts`
- Modify: `src/core/geometry.ts`

**Step 1: Write failing behavior tests**

Create one arrow, change Direction to Two-way, change Arrow style to Bold, verify both changes are undoable, bend the Bold arrow, and verify copied/saved pixels include a wide filled silhouette at both endpoints.

**Step 2: Verify RED**

Run: `npx playwright test tests/desktop/line-and-arrow-styles.spec.ts --config=playwright.desktop.config.ts --project=chromium -g "arrow"`

Expected: FAIL because the direction and appearance controls do not exist.

**Step 3: Implement minimal behavior**

Add accessible segmented property controls that update the selected arrow. Render Standard direction heads as strokes and Bold outlines as filled closed paths, using identical geometry for bounds and hit testing. Leave absent fields as `one-way`/`standard`.

**Step 4: Verify GREEN**

Run the targeted Playwright and Vitest commands; expect PASS.

**Step 5: Commit**

```bash
git add tests/desktop/line-and-arrow-styles.spec.ts src/editor/Properties.tsx src/editor/render.ts src/core/geometry.ts
git commit -m "feat(editor): add configurable arrow styles"
```

### Task 4: Document and verify the complete feature

**Files:**

- Modify: `desktop/README.md`
- Modify: `README.md`

**Step 1: Update user documentation**

Document Line, Shift angle snapping, arrow direction/style controls, bold curved arrows, and the `L` shortcut.

**Step 2: Run complete verification**

Run:

```bash
npm run check
npm run desktop:build:web
npx playwright test tests/desktop/line-and-arrow-styles.spec.ts --config=playwright.desktop.config.ts --project=chromium
npx playwright test --config=playwright.desktop.config.ts --project=chromium --workers=1
```

Expected: every command exits 0.

**Step 3: Commit**

```bash
git add README.md desktop/README.md
git commit -m "docs: explain lines and arrow styles"
```

**Step 4: Push PR updates**

Run: `git push origin feat/desktop-add-screenshot-layer`

Expected: PR #1 updates with the new commits.
