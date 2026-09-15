# Source navigation and image layers implementation plan

> Execute task-by-task with test-first changes and independent review in this session.

**Goal:** Return to a captured website without losing the editor, and add local image layers with proportional resizing and predictable ordering.

**Architecture:** Reuse Chrome's live opener relationship for fresh captures; Recent falls back to the saved HTTP(S) URL. Store immutable decoded image assets outside document history, referenced by small image objects. Composite images below annotations and before privacy effects, sharing one renderer for preview and export.

**Tech Stack:** TypeScript, React, Canvas 2D, Chrome MV3/WXT, Vitest, Playwright. No new dependencies or permissions.

## Approved boundaries

- Back to website keeps the editor tab, drafts, and undo history open. Reuse the opener only if its normalized URL exactly matches; otherwise open the saved URL. Hide for imports.
- PNG/JPEG/WebP through Add image, paste, or drop. Empty editor imports a background; Open image remains replacement. Never intercept paste inside text fields.
- Images move, resize proportionally through corner handles, duplicate, delete, nudge, undo/redo, and export.
- Images stay below drawings. Bring forward / Send backward reorder within the same paint family. Redaction stays above everything, including lenses.
- Local session assets, no persistence/network/SVG/stamps/rotation. Retain assets for undo; release on replacement/unmount. Bound total inserted-image decoded pixels.
- Published v0.2.0 and its tag remain unchanged. No automatic next release or public push.

## Task 1: Source navigation (platform agent)

Files: create `src/platform/source-navigation.ts` and `.test.ts`; integration in `src/editor/Editor.tsx`, `EditorHeader.tsx` by coordinator.

1. Write failing tests for safe URL parsing, exact opener match, closed/changed opener, Recent fallback, and API errors.
2. Run `npx vitest run src/platform/source-navigation.test.ts`; record RED.
3. Implement `sourceWebsiteUrl(value): string | null` and `returnToWebsite({ url, allowCaptureOpener }): Promise<void>` using getCurrent/get/update/windows.update/create. No stored tab IDs or new permissions.
4. Run the same tests; require GREEN. Review the diff before commit.

## Task 2: Image geometry and ordering (core agent)

Files: modify `src/core/model.ts`, `geometry.ts`, `layers.ts` and their tests; create `src/core/image-geometry.ts` and `.test.ts`.

1. Add failing tests for image bounds/movement/hit testing, fixed-opposite-corner proportional resizing including crossing/minimum size, initial fit, stable layer families, and order boundaries.
2. Run the affected Vitest files and record RED.
3. Add `ImageObject { type: 'image'; assetId: string; rect: Rect }`. Keep Tool unchanged. Export corner handles, resize/initial-placement helpers and `reorderObject(objects, id, direction)` plus boundary helper. Preserve references for no-ops.
4. Require GREEN, then review. Document exact APIs for the coordinator.

## Task 3: Safe assets and shared compositing (coordinator)

Files: create `src/editor/image-assets.ts` and `.test.ts`; modify `render-effects.ts`, `render.ts`, `src/export/image.ts`.

1. Test MIME/file limits, aggregate decoded budget, failed/late decode cleanup, and asset lookup/lifecycle before implementation.
2. Run `npx vitest run src/editor/image-assets.test.ts`; record RED.
3. Decode local files into ImageBitmap assets. Retain assets through undo; close on disposal. Pass a read-only registry to preview/export. Missing assets fail explicitly.
4. Composite ordered images before redaction/blur/lenses; include asset IDs and rectangles in effect-cache signature. Do not draw images again above filters.
5. Verify unit tests and real exported pixels through browser tests in Task 5.

## Task 4: Editor interaction (coordinator)

Files: modify `Editor.tsx`, `EditorHeader.tsx`, `DrawingCanvas.tsx`, `Properties.tsx`, `editor.css`.

1. Use Task 5 failing browser coverage to drive Back, Add image, paste/drop, selection/resize, layer buttons, and undo.
2. Track fresh-capture provenance separately from the record. Add Back loading/error state.
3. Decode before inserting, use current document at commit, cancel old gestures, and ignore late operations after session replacement. Protect export while import is pending.
4. Add proportional corner handles and image properties. Hide irrelevant style controls. Use accessible labels and disable unavailable layer moves.

## Task 5: Browser acceptance and docs (QA agent + coordinator)

Files: create `tests/e2e/image-layers.spec.ts`; extend `capture.spec.ts` if needed; update `README.md`, `CHANGELOG.md`, `tests/README.md`.

1. Write browser tests for insertion/paste, proportional resize/move, undo/redo, order, downloaded pixels, and effects over inserted images. Add Back real opener/fallback/preserved-work tests.
2. Run the new tests against the pre-integration build to establish RED; use synthetic local fixtures, never personal websites or profiles.
3. After integration run `npm run check`, then `npm run test:e2e`. Run native capture coverage with the established Xvfb command separately (one browser suite at a time).
4. Independently review implementation against these boundaries; fix actionable issues with regression tests.
5. Update docs for unreleased features and privacy/limits. Keep release download links and version 0.2.0 intact until release is requested. Build a ZIP if useful for local testing, clearly identify as development build.
6. Commit verified work with GitHub no-reply metadata; offer integration/publication choices without publishing automatically.

## Progress

- [x] User approved focused scope.
- [x] Isolated worktree created from committed release baseline.
- [x] Source navigation tests and implementation.
- [x] Geometry/order tests and implementation.
- [x] Asset lifecycle and renderer integration.
- [x] Editor controls and browser coverage.
- [x] Full checks, review, docs, and local handoff.

## Verification results

- `npm run check`: TypeScript, ESLint, formatting, 140 unit tests, and production build passed.
- Complete Xvfb/native-input browser suite: 26 passed, including genuine Chrome capture,
  opener activation/fallback, paste/drop, resizing, ordering, and privacy-processed exports.
- Independent review found two issues, both fixed and regression-tested: small-image
  resize hit targets obscuring body dragging, and the narrow-layout Add image accessible name.
- `node scripts/capture-readme.mjs --image-layers`: captured the actual editor using only
  fictional local content and the project's own icon. Existing release screenshots retained.
- Main checkout excludes local feature worktrees from its own checks; its baseline check
  also passed (58 unit tests). No published commits, tags, dependencies, or permissions changed.
