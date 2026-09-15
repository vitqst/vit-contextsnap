import { describe, expect, it } from 'vitest';
import { getArrowLabelLayout, hitTestArrowLabel, moveArrowLabelBy } from './arrow-label';
import { getArrowLabelPosition, hitTestObject, moveObject, objectBounds } from './geometry';
import type { ArrowObject, Rect } from './model';

const arrow: ArrowObject = {
  id: 'label',
  seed: 1,
  type: 'arrow',
  style: { color: '#e05252', width: 4, sketch: true },
  start: { x: 160, y: 240 },
  end: { x: 640, y: 240 },
  control: { x: 400, y: 320 },
  label: 'Fix the button spacing',
  labelOffset: { x: 0, y: 0 },
};

function expectInside(rect: Rect, bounds: Rect) {
  expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
  expect(rect.y).toBeGreaterThanOrEqual(bounds.y);
  expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
}

describe('arrow label layout', () => {
  it('clamps a tall attached label inside the screenshot at the top edge', () => {
    const topEdge: ArrowObject = {
      ...arrow,
      start: { x: 40, y: 30 },
      control: { x: 240, y: 30 },
      end: { x: 440, y: 30 },
      label:
        'A longer explanation that needs several wrapped lines near the top edge of the screenshot',
    };
    const bounds = { x: 0, y: 0, width: 600, height: 400 };
    const layout = getArrowLabelLayout(topEdge, bounds);
    expect(layout.rect.y).toBe(0);
    expectInside(layout.rect, bounds);
  });

  it('dragging an attached label translates every arrow point without detaching it', () => {
    const topEdge: ArrowObject = {
      ...arrow,
      start: { x: 40, y: 30 },
      control: { x: 240, y: 30 },
      end: { x: 440, y: 30 },
    };
    const bounds = { x: 0, y: 0, width: 600, height: 400 };
    const before = getArrowLabelLayout(topEdge, bounds);
    const dragged = moveArrowLabelBy(topEdge, { x: 15, y: 90 }, bounds);
    const after = getArrowLabelLayout(dragged, bounds);
    expect(after.rect.y).toBe(before.rect.y + 90);
    expect(after.rect.x).toBe(before.rect.x + 15);
    expect(dragged.start).toEqual({ x: 55, y: 120 });
    expect(dragged.control).toEqual({ x: 255, y: 120 });
    expect(dragged.end).toEqual({ x: 455, y: 120 });
    expect(dragged.labelOffset).toEqual({ x: 0, y: 0 });
    expect(topEdge.start).toEqual({ x: 40, y: 30 });
  });

  it('centers the readable badge directly on its curve midpoint', () => {
    const layout = getArrowLabelLayout(arrow);
    expect(getArrowLabelPosition(arrow)).toEqual({ x: 400, y: 280 });
    expect(layout.center).toEqual({ x: 400, y: 280 });
    expect(layout.fontSize).toBe(20);
    expect(layout.truncated).toBe(false);
    expect(layout.lines.join(' ')).toBe(arrow.label);
  });

  it('attaches a straight arrow label to its effective midpoint despite a retained bend', () => {
    const straight: ArrowObject = { ...arrow, mode: 'straight' };
    expect(getArrowLabelLayout(straight).center).toEqual({ x: 400, y: 240 });
    expect(straight.control).toEqual({ x: 400, y: 320 });
  });

  it('ignores legacy label offsets so old labels cannot remain detached', () => {
    const legacy = { ...arrow, labelOffset: { x: -1000, y: 300 } };
    expect(getArrowLabelLayout(legacy)).toEqual(getArrowLabelLayout(arrow));
    expect(legacy.labelOffset).toEqual({ x: -1000, y: 300 });
  });

  it('does not scale text when the arrow length changes', () => {
    const longer = { ...arrow, end: { x: 1400, y: 240 } };
    expect(getArrowLabelLayout(longer).fontSize).toBe(getArrowLabelLayout(arrow).fontSize);
    expect(getArrowLabelLayout(longer).rect.width).toBe(getArrowLabelLayout(arrow).rect.width);
  });

  it('uses an explicit label font independently of stroke width', () => {
    const thin = getArrowLabelLayout({ ...arrow, labelFontSize: 24 });
    const thick = getArrowLabelLayout({
      ...arrow,
      labelFontSize: 24,
      style: { ...arrow.style, width: 16 },
    });
    expect(thick).toEqual(thin);
    expect(thin.fontSize).toBe(24);
  });

  it('wraps unbroken text to a bounded width and truncates after eight lines without changing the model', () => {
    const long = { ...arrow, label: 'abcdefgh'.repeat(1000) };
    const layout = getArrowLabelLayout(long);
    expect(layout.rect.width).toBeLessThanOrEqual(320);
    expect(layout.lines).toHaveLength(8);
    expect(layout.lines[7]).toMatch(/…$/u);
    expect(layout.truncated).toBe(true);
    expect(long.label).toHaveLength(8000);
  });

  it('wraps words and preserves explicit paragraph breaks', () => {
    const layout = getArrowLabelLayout({ ...arrow, label: 'First line\n\nSecond paragraph' });
    expect(layout.lines).toEqual(['First line', '', 'Second paragraph']);
    expect(layout.truncated).toBe(false);
  });

  it('clamps and truncates within an offset crop, sharing the same clickable badge geometry', () => {
    const bounds = { x: 220, y: 310, width: 160, height: 80 };
    const labeled = {
      ...arrow,
      label: 'A fairly long label that should stay readable inside this crop',
    };
    const layout = getArrowLabelLayout(labeled, bounds);
    expectInside(layout.rect, bounds);
    expect(layout.lines).toHaveLength(2);
    expect(layout.truncated).toBe(true);
    expect(hitTestArrowLabel(labeled, layout.center, bounds)).toBe(true);
    expect(hitTestObject(labeled, layout.center, 0, bounds)).toBe(true);
    const combined = objectBounds(labeled, bounds);
    expect(combined.y + combined.height).toBeGreaterThanOrEqual(layout.rect.y + layout.rect.height);
    expect(hitTestArrowLabel(labeled, { x: bounds.x - 10, y: bounds.y - 10 }, bounds)).toBe(false);
  });

  it('does not put unreadable overflowing text into a very small crop', () => {
    const bounds = { x: 100, y: 100, width: 4, height: 4 };
    const layout = getArrowLabelLayout(arrow, bounds);
    expectInside(layout.rect, bounds);
    expect(layout.lines).toEqual([]);
    expect(layout.truncated).toBe(true);
  });

  it('moves the wrapped badge with its arrow without mutating the source', () => {
    const before = getArrowLabelLayout(arrow);
    const moved = getArrowLabelLayout(moveObject(arrow, { x: 35, y: -15 }));
    expect(moved.center).toEqual({ x: before.center.x + 35, y: before.center.y - 15 });
    expect(moved.lines).toEqual(before.lines);
    expect(arrow.labelOffset).toEqual({ x: 0, y: 0 });
  });

  it('moves the arrow when dragging a crop-clamped label without writing a detached offset', () => {
    const bounds = { x: 100, y: 200, width: 500, height: 300 };
    const clamped = {
      ...arrow,
      start: { x: -240, y: 0 },
      control: { x: 0, y: 80 },
      end: { x: 240, y: 0 },
      labelOffset: { x: -1000, y: -1000 },
    };
    const before = getArrowLabelLayout(clamped, bounds);
    expect(before.rect.x).toBe(bounds.x);
    expect(before.rect.y).toBe(bounds.y);
    const moved = moveArrowLabelBy(clamped, { x: 30, y: 40 }, bounds);
    const after = getArrowLabelLayout(moved, bounds);
    expect(moved.start).toEqual({ x: -210, y: 40 });
    expect(moved.control).toEqual({ x: 30, y: 120 });
    expect(moved.end).toEqual({ x: 270, y: 40 });
    expectInside(after.rect, bounds);
    expect(moved.labelOffset).toEqual(clamped.labelOffset);
    expect(clamped.labelOffset).toEqual({ x: -1000, y: -1000 });
  });

  it('preserves cropped wrapping while translating the attached arrow', () => {
    const bounds = { x: 200, y: 200, width: 180, height: 300 };
    const clamped = {
      ...arrow,
      label: 'A moderately long label that wraps more inside a narrow crop',
      labelOffset: { x: 0, y: -1000 },
    };
    const before = getArrowLabelLayout(clamped, bounds);
    const moved = moveArrowLabelBy(clamped, { x: 0, y: 10 }, bounds);
    const after = getArrowLabelLayout(moved, bounds);
    expect(after.rect.y).toBe(before.rect.y + 10);
    expect(after.lines).toEqual(before.lines);
    expect(moved.control.y).toBe(clamped.control.y + 10);
  });
});
