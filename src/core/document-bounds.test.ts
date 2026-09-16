import { describe, expect, it, vi } from 'vitest';
import { documentBounds } from './document-bounds';
import { getArrowLabelLayout } from './arrow-label';
import { objectBounds } from './geometry';
import { getNoteLayout } from './notes';
import { measureText } from './label-layout';
import type { ArrowObject, DrawingObject } from './model';
import * as geometry from './geometry';

const base = {
  id: 'object',
  seed: 1,
  style: { color: '#e05252', width: 4, sketch: false, shadow: false },
};
const arrow: ArrowObject = {
  ...base,
  type: 'arrow',
  start: { x: -100, y: -60 },
  end: { x: 1200, y: 800 },
  control: { x: 550, y: 370 },
  label: '',
  labelOffset: { x: 0, y: 0 },
};

function expectContains(
  outer: ReturnType<typeof documentBounds>,
  inner: ReturnType<typeof objectBounds>,
) {
  expect(outer.x).toBeLessThanOrEqual(inner.x);
  expect(outer.y).toBeLessThanOrEqual(inner.y);
  expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width);
  expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height);
}

describe('content-sized document canvas', () => {
  it('reuses immutable object extents while an image moves, without losing new bounds', () => {
    const annotation = { ...arrow, label: 'Unchanged annotation' };
    const image: DrawingObject = {
      ...base,
      id: 'image',
      type: 'image',
      assetId: 'photo',
      rect: { x: 0, y: 0, width: 100, height: 100 },
    };
    const measure = vi.spyOn(geometry, 'objectBounds');
    try {
      const before = documentBounds(960, 640, [annotation, image]);
      measure.mockClear();
      const moved = geometry.moveObject(image, { x: -1500, y: -900 });
      const after = documentBounds(960, 640, [annotation, moved]);
      const repeated = documentBounds(960, 640, [annotation, moved]);
      expect(after).toEqual(repeated);
      expect(after.x).toBe(-1500);
      expect(after.y).toBe(-900);
      expect(after.x + after.width).toBe(before.x + before.width);
      expect(measure).toHaveBeenCalledTimes(1);
      expect(measure).toHaveBeenCalledWith(moved);
      // Undo reuses prior immutable objects and their exact previous extents.
      expect(documentBounds(960, 640, [annotation, image])).toEqual(before);
      expect(measure).toHaveBeenCalledTimes(1);
    } finally {
      measure.mockRestore();
    }
  });

  it('preserves original pixel dimensions when annotations stay inside the screenshot', () => {
    expect(documentBounds(960, 640, [])).toEqual({ x: 0, y: 0, width: 960, height: 640 });
    expect(
      documentBounds(960, 640, [
        { ...base, type: 'rectangle', rect: { x: 20, y: 30, width: 100, height: 50 } },
      ]),
    ).toEqual({ x: 0, y: 0, width: 960, height: 640 });
  });

  it('expands left, top, right, and bottom to include an arrow and its entire head', () => {
    const bounds = documentBounds(960, 640, [arrow]);
    expectContains(bounds, objectBounds(arrow));
    expectContains(bounds, { x: 0, y: 0, width: 960, height: 640 });
    expect(bounds.x).toBeLessThan(-100);
    expect(bounds.y).toBeLessThan(-60);
    expect(bounds.x + bounds.width).toBeGreaterThan(1200);
    expect(bounds.y + bounds.height).toBeGreaterThan(800);
  });

  it('includes freely positioned labels instead of clamping them back into the screenshot', () => {
    const labeled = {
      ...arrow,
      label: 'Outside the screenshot',
      labelOffset: { x: -200, y: -100 },
    };
    expectContains(documentBounds(960, 640, [labeled]), getArrowLabelLayout(labeled).rect);
    const step: DrawingObject = {
      ...base,
      type: 'step',
      center: { x: 960, y: 630 },
      radius: 22,
      number: 1,
      note: 'An outside note',
      labelPosition: 'free',
      labelOffset: { x: 200, y: 150 },
    };
    expectContains(documentBounds(960, 640, [step]), getNoteLayout(step).rect);
  });

  it('covers inserted images at negative coordinates with outward integer rounding', () => {
    expect(
      documentBounds(960, 640, [
        {
          ...base,
          type: 'image',
          assetId: 'pasted',
          rect: { x: -20.5, y: -10.25, width: 100, height: 80 },
        },
      ]),
    ).toEqual({ x: -21, y: -11, width: 981, height: 651 });
  });

  it('includes outer lens rings, text halos, and enabled annotation shadows', () => {
    const lens: DrawingObject = {
      ...base,
      type: 'magnifier',
      center: { x: 1000, y: 700 },
      radius: 20,
      zoom: 2,
    };
    expectContains(documentBounds(960, 640, [lens]), { x: 976, y: 676, width: 48, height: 48 });
    const withShadow = { ...arrow, style: { ...base.style, shadow: true } };
    const plain = documentBounds(960, 640, [arrow]);
    const shadow = documentBounds(960, 640, [withShadow]);
    expect(shadow.width).toBeGreaterThan(plain.width);
    expect(shadow.height).toBeGreaterThan(plain.height);
    const text: DrawingObject = {
      ...base,
      type: 'text',
      position: { x: -10, y: -10 },
      text: 'Test',
      fontSize: 28,
    };
    expect(documentBounds(960, 640, [text]).x).toBeLessThan(-10);
  });

  it('includes wide text glyphs rather than estimating every character at an average width', () => {
    const text: DrawingObject = {
      ...base,
      type: 'text',
      position: { x: 950, y: 50 },
      text: 'WWWW',
      fontSize: 28,
    };
    const bounds = documentBounds(960, 640, [text]);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(950 + measureText('WWWW', 28) + 2);
  });
});
