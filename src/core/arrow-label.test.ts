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

  it('places the label above the arrow tail for straight and curved arrows', () => {
    for (const mode of ['straight', 'curved'] as const) {
      const layout = getArrowLabelLayout({ ...arrow, mode });
      expect(layout.center.x).toBe(arrow.start.x);
      expect(layout.rect.y + layout.rect.height).toBe(arrow.start.y - 8);
      expect(getArrowLabelPosition({ ...arrow, mode })).toEqual(layout.center);
      expect(layout.fontSize).toBe(20);
      expect(layout.lines.join(' ')).toBe(arrow.label);
    }
  });

  it('drags only the label, preserving arrow geometry and source data', () => {
    const before = getArrowLabelLayout(arrow);
    const dragged = moveArrowLabelBy(arrow, { x: 45, y: 60 });
    expect(getArrowLabelLayout(dragged).center).toEqual({
      x: before.center.x + 45,
      y: before.center.y + 60,
    });
    expect(dragged.start).toEqual(arrow.start);
    expect(dragged.end).toEqual(arrow.end);
    expect(dragged.control).toEqual(arrow.control);
    expect(arrow.labelOffset).toEqual({ x: 0, y: 0 });
  });

  it('follows a resized tail and preserves the custom offset', () => {
    const dragged = moveArrowLabelBy(arrow, { x: 45, y: 60 });
    const before = getArrowLabelLayout(dragged);
    const resized = { ...dragged, start: { x: arrow.start.x + 70, y: arrow.start.y + 20 } };
    expect(getArrowLabelLayout(resized).center).toEqual({
      x: before.center.x + 70,
      y: before.center.y + 20,
    });
    expect(resized.labelOffset).toEqual(dragged.labelOffset);
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

  it('drags from the visible crop-clamped position without jumping', () => {
    const bounds = { x: 200, y: 200, width: 500, height: 300 };
    const clamped = { ...arrow, start: { x: -240, y: 0 } };
    const before = getArrowLabelLayout(clamped, bounds);
    const moved = moveArrowLabelBy(clamped, { x: 30, y: 40 }, bounds);
    const after = getArrowLabelLayout(moved, bounds);
    expect(after.center).toEqual({ x: before.center.x + 30, y: before.center.y + 40 });
    expect(moved.start).toEqual(clamped.start);
    expect(after.lines).toEqual(before.lines);
  });
});
