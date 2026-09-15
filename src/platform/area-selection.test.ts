import { describe, expect, it } from 'vitest';
import { moveSelection, resizeSelection, selectionFromPoints } from './area-selection';

const viewport = { width: 800, height: 600 };

describe('area selection geometry', () => {
  it('allows dragging in any direction and clamps to the viewport', () => {
    expect(selectionFromPoints({ x: 400, y: 300 }, { x: -10, y: 700 }, viewport, false)).toEqual({
      x: 0,
      y: 300,
      width: 400,
      height: 300,
    });
  });

  it('preserves a square when a constrained drag hits the viewport edge', () => {
    expect(selectionFromPoints({ x: 700, y: 500 }, { x: 780, y: 700 }, viewport, true)).toEqual({
      x: 700,
      y: 500,
      width: 100,
      height: 100,
    });
  });

  it('keeps the whole selection visible when moved with pointer or keyboard', () => {
    expect(moveSelection({ x: 700, y: 500, width: 100, height: 100 }, 20, -600, viewport)).toEqual({
      x: 700,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('can resize past the opposite corner without negative dimensions', () => {
    expect(
      resizeSelection(
        { x: 100, y: 100, width: 200, height: 150 },
        'nw',
        { x: 350, y: 300 },
        viewport,
        false,
      ),
    ).toEqual({ x: 300, y: 250, width: 50, height: 50 });
  });

  it('side handles preserve the untouched axis', () => {
    expect(
      resizeSelection(
        { x: 100, y: 100, width: 200, height: 150 },
        'e',
        { x: 400, y: 550 },
        viewport,
        false,
      ),
    ).toEqual({ x: 100, y: 100, width: 300, height: 150 });
  });
});
