# Drawing refinements implementation plan

> Execute in this session with test-driven development, isolated file ownership, and independent review.

**Goal:** Attached arrow labels, editable shape notes and sticky cards, and pressure/speed-aware free drawing.

**Architecture:** Keep immutable source-pixel objects and one shared canvas renderer for preview/export. Add pure arrow, note-layout, and brush modules; React owns tools/settings and inline editing. No new dependencies, permissions, persistence format, or public release changes.

**Tech stack:** TypeScript, React, WXT, Canvas, perfect-freehand, Vitest, Playwright.

## Approved design

- Arrow labels sit on the curve midpoint, in a readable gap. Dragging the label moves its entire arrow; no detached-label handle. Text size does not scale with arrow length. Existing wrapped labels remain editable.
- Straight/Curved mode is explicit for creation and selection. Endpoints remain fixed when switching; curvature is retained for switching back. Straight arrows stay straight when an endpoint moves.
- Latest user amendment: arrows AND their labels have a shared Shadow toggle, default on. Sticky cards have their own Shadow toggle, default on. Step, lens, rectangle, plain text and other shape notes are flat. Canvas zoom still scales everything normally.
- Double-click existing shapes to edit their attached text. Empty text removes only the note, not its shape. Notes move with their owning shape and survive duplication, undo/redo, crop and export. Privacy masks remain opaque and topmost.
- Sticky tool (N): click or drag to place a colored card and type directly. Move via body, resize using corners, edit via double-click. Card text scales on resize; wrap and bound text, preserving the complete editable value. Only cards use resize-scaled text.
- Pen: capture pressure, source-pixel position and timestamp, including coalesced events. Real contact pressure wins; mouse/no-pressure input uses time-based speed. Preserve last contact pressure at release, do not invent a zero-pressure endpoint. Smoothing/pressure influence/speed influence sliders apply to new and selected strokes; zero influence gives constant width. Store settings and samples in history for deterministic export.

## Tasks and acceptance checks

- [ ] Baseline: preserve preload fix in its own local commit; create ignored worktree; `npm ci && npm test` must pass.
- [ ] Arrow core: `src/core/arrows.ts`, `arrow-label.ts` and tests. Write midpoint attachment/mode-switch tests first, run RED, implement, run GREEN. API: `arrowMode`, `arrowControl`, `withArrowMode`. Root integrates geometry and pointer handling.
- [ ] Notes core: `src/core/notes.ts`, `src/editor/render-notes.ts`, tests. Pure shared text layout, object text helpers, bounded card creation/resizing and scalable font. Test default shadow, move/resize text bounds, empty text, multiline/wrapping and legacy objects before implementation.
- [ ] Brush core: `src/core/brush.ts`, `src/editor/BrushProperties.tsx`, tests. API: `DEFAULT_BRUSH`, `normalizeBrush`, `sampleStrokePoint`, `penOutline`; input sample stores `time` and `input`. Test true pressure, identical paths with different timestamps, zero influence, duplicate times, release handling and deterministic settings before implementation.
- [ ] Integration: root owns `model.ts`, `geometry.ts`, `render.ts`, `render-effects.ts`, `DrawingCanvas.tsx`, `Editor.tsx`, `Properties.tsx`, `Toolbar.tsx`, CSS. Write failing browser tests for sticky placement/edit/resize/shadow, rectangle note movement, attached-label dragging, arrow mode/shadow and pen controls; then implement.
- [ ] Regression: adjust only obsolete detached-label expectations; keep capture/privacy/export assertions. Unit tests for geometry/history and browser tests for actual pixels, shadows on/off, unchanged text size on arrows, scaled card text, speed-driven widths, crop, undo and privacy overlap.
- [ ] Review/finish: `npm run check`; headed native `xvfb-run -a -s '-screen 0 1920x1200x24' sh -c 'CI=1 CONTEXTSNAP_NATIVE_INPUT=1 CONTEXTSNAP_HEADED=1 CONTEXTSNAP_TEST_DISPLAY="$DISPLAY" npm run test:e2e'`; inspect real-editor screenshots; independent review; update README/CHANGELOG with unreleased scope. Commit locally and offer integration; do not push or replace public ZIPs without instruction.

## Shared model contract

```ts
interface BrushSettings {
  smoothing: number;
  pressure: number;
  speed: number;
}
// StrokePoint keeps pressure and adds optional time/input for legacy compatibility.
// input: 'pen' means measured pressure; 'mouse' uses speed.
// ObjectStyle.shadow?: boolean is honored only by arrow/sticky (undefined means on).
// ObjectBase.note?: string is an attached note for other shapes.
// ArrowObject.mode?: 'straight' | 'curved'; control retains the editable bend.
// PenObject.brush?: BrushSettings;
// StickyObject: type:'sticky'; rect:Rect; text:string; fontSize:number;
```

No generative mockup is needed: this extends an existing code-native canvas/visual system, not a website redesign. Validate the real rendered editor instead.
