import { describe, expect, it } from 'vitest';
import { arrowHandles } from './arrow-handles';
import { getArrowLabelLayout } from './arrow-label';
import type { ArrowObject, Point, Rect } from './model';

const arrow: ArrowObject = {
  id: 'arrow',
  seed: 1,
  type: 'arrow',
  style: { color: '#e05252', width: 4, sketch: false },
  mode: 'curved',
  start: { x: 100, y: 200 },
  end: { x: 500, y: 200 },
  control: { x: 300, y: 280 },
  label: 'Attached label',
  labelOffset: { x: 0, y: 0 },
};
const scene = { x: 0, y: 0, width: 600, height: 400 };

function bend(object: ArrowObject, bounds = scene, scale = 1): Point {
  const handle = arrowHandles(object, bounds, scale).find(([name]) => name === 'control');
  expect(handle).toBeDefined();
  return handle![1];
}

function expectVisible(point: Point, bounds: Rect, scale: number) {
  const radius = 5.5 / scale;
  expect(point.x - radius).toBeGreaterThanOrEqual(bounds.x);
  expect(point.y - radius).toBeGreaterThanOrEqual(bounds.y);
  expect(point.x + radius).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(point.y + radius).toBeLessThanOrEqual(bounds.y + bounds.height);
}

function expectOutsideLabel(object: ArrowObject, bounds: Rect, point: Point, scale: number) {
  const { rect } = getArrowLabelLayout(object, bounds);
  const radius = 5.5 / scale;
  expect(
    point.x + radius < rect.x ||
      point.x - radius > rect.x + rect.width ||
      point.y + radius < rect.y ||
      point.y - radius > rect.y + rect.height,
  ).toBe(true);
}

describe('arrow editing handles', () => {
  it('keeps endpoints unchanged and exposes a midpoint bend handle for a straight arrow', () => {
    expect(arrowHandles({ ...arrow, mode: 'straight' }, scene, 1)).toEqual([
      ['start', arrow.start],
      ['end', arrow.end],
      ['control', { x: 300, y: 200 }],
    ]);
  });

  it('exposes the bend handle for legacy straight arrows without an explicit mode', () => {
    const legacy = { ...arrow, mode: undefined, control: { x: 300, y: 200 }, label: '' };
    expect(bend(legacy)).toEqual({ x: 300, y: 200 });
  });

  it('keeps the straight-arrow bend handle clear of an independently positioned label', () => {
    const straight: ArrowObject = { ...arrow, mode: 'straight' };
    const center = getArrowLabelLayout(straight, scene).center;
    const labeled = {
      ...straight,
      labelOffset: { x: 300 - center.x, y: 200 - center.y },
    };
    const handle = bend(labeled);
    expectVisible(handle, scene, 1);
    expectOutsideLabel(labeled, scene, handle, 1);
  });

  it('uses the curve midpoint for an unlabeled arrow when it is visible', () => {
    expect(bend({ ...arrow, label: '' })).toEqual({ x: 300, y: 240 });
  });

  it('keeps the bend on its midpoint when the tail label leaves it clear', () => {
    const handle = bend(arrow);
    expect(handle).toEqual({ x: 300, y: 240 });
    expectVisible(handle, scene, 1);
    expectOutsideLabel(arrow, scene, handle, 1);
  });

  it('keeps the bend clear of a top-clamped tail label', () => {
    const top = {
      ...arrow,
      start: { x: 100, y: 4 },
      control: { x: 300, y: 12 },
      end: { x: 500, y: 4 },
    };
    const handle = bend(top);
    expectVisible(handle, scene, 1);
    expectOutsideLabel(top, scene, handle, 1);
  });

  it('keeps the handle above a bottom-clamped label', () => {
    const bottom = {
      ...arrow,
      start: { x: 100, y: 390 },
      control: { x: 300, y: 410 },
      end: { x: 500, y: 390 },
    };
    const handle = bend(bottom);
    expectVisible(handle, scene, 1);
    expectOutsideLabel(bottom, scene, handle, 1);
  });

  it('keeps a handle inside an offset crop even when the curve midpoint is outside', () => {
    const bounds = { x: 420, y: 260, width: 160, height: 120 };
    const handle = bend(arrow, bounds);
    expectVisible(handle, bounds, 1);
    expectOutsideLabel(arrow, bounds, handle, 1);
  });

  it('uses a side handle when a tall label leaves no space above or below', () => {
    const tall = {
      ...arrow,
      start: { x: 100, y: 40 },
      end: { x: 500, y: 40 },
      control: { x: 300, y: 40 },
      label: 'One\nTwo\nThree',
    };
    const bounds = { x: 0, y: 0, width: 600, height: 90 };
    const handle = bend(tall, bounds);
    expectVisible(handle, bounds, 1);
    expectOutsideLabel(tall, bounds, handle, 1);
  });

  it.each([0.25, 0.5, 2, 4])('keeps the entire handle visible at zoom %s', (scale) => {
    const top = {
      ...arrow,
      start: { x: 100, y: 4 },
      control: { x: 300, y: 12 },
      end: { x: 500, y: 4 },
    };
    const handle = bend(top, scene, scale);
    expectVisible(handle, scene, scale);
    expectOutsideLabel(top, scene, handle, scale);
  });

  it('falls back to a finite point inside a tiny crop fully covered by the label', () => {
    const bounds = { x: 295, y: 230, width: 5, height: 5 };
    const handle = bend(arrow, bounds, 0.5);
    expect(handle.x).toBeGreaterThanOrEqual(bounds.x);
    expect(handle.y).toBeGreaterThanOrEqual(bounds.y);
    expect(handle.x).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(handle.y).toBeLessThanOrEqual(bounds.y + bounds.height);
  });
});
