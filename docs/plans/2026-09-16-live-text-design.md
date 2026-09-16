# Live annotation text and local typography

## Requested behavior

- Sticky notes keep their card size and fit text live as it is typed. Plain text uses a
  resizable width, wraps, and grows vertically without a line-count cap.
- Text is painted in the real scene during editing, including shadows and magnifiers.
  A transparent native textarea supplies caret, selection, IME, and clipboard behavior;
  it has no input-box background, border, or resize decoration.
- Keystrokes update a document preview, not undo history. Finishing commits one edit;
  Escape restores the previous content. Starting another gesture must use the committed draft.
- New arrows are straight. A middle handle bends them; no Straight/Curved property switch.
  Previously curved arrows retain their geometry.
- Playpen Sans is bundled locally for text, notes, and labels, including Vietnamese.
  Both editor entrypoints wait for it before measuring/caching annotation geometry.

## Implementation boundaries

Shared core layout supplies canvas paint, hit testing, handles, inline placement, and export.
Optional text width keeps old unbounded text documents readable. Resizing text width never
changes its font size. The existing canvas allocation, cached effects, privacy ordering,
native screenshot lifecycle, and extension integration remain intact.

Notes shrink down to 8px when necessary; only extreme overflow at that minimum is truncated
visually, never in stored text. Plain text has no artificial height cap, subject to the
existing overall image/export safety limit.

## Verification

Core regression tests cover wrapping, resizing, sticky fitting, bounds, and straight-arrow
bending. Browser tests cover live pixels before blur, no input box chrome, one-step undo,
Escape cancellation, wrapping/height growth, and resize handles in Chromium and WebKit.
The new three live-text browser cases failed before implementation because canvas pixels
did not change until editing finished. Run full unit, desktop browser, extension browser,
type/lint/format, and both production builds before handoff.
