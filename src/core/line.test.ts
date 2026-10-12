import { describe, expect, it } from 'vitest';
import { hitTestObject, moveObject, objectBounds } from './geometry';
import { moveLineHandle, snapLinePoint } from './line';
import type { LineObject } from './model';

const line: LineObject = {
  id: 'line',
  seed: 1,
  type: 'line',
  style: { color: '#e05252', width: 4, sketch: false },
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
};

describe('line geometry', () => {
  it('snaps to the nearest 45 degree angle while preserving length', () => {
    const origin = { x: 10, y: 20 };
    const point = { x: 110, y: 72 };
    const snapped = snapLinePoint(origin, point);
    expect(Math.hypot(snapped.x - origin.x, snapped.y - origin.y)).toBeCloseTo(
      Math.hypot(point.x - origin.x, point.y - origin.y),
    );
    expect(snapped.x - origin.x).toBeCloseTo(snapped.y - origin.y);
    expect(snapLinePoint(origin, { x: 11, y: 120 }).x).toBeCloseTo(origin.x);
    expect(snapLinePoint(origin, { x: 110, y: 21 }).y).toBeCloseTo(origin.y);
  });

  it('moves either endpoint freely or snapped around the fixed endpoint', () => {
    expect(moveLineHandle(line, 'end', { x: 80, y: 30 }, false).end).toEqual({ x: 80, y: 30 });
    const snapped = moveLineHandle(line, 'start', { x: 40, y: 75 }, true);
    expect(Math.abs(snapped.start.x - snapped.end.x)).toBeCloseTo(
      Math.abs(snapped.start.y - snapped.end.y),
    );
    expect(snapped.end).toEqual(line.end);
  });

  it('moves, bounds, and hit-tests the visible segment', () => {
    expect(moveObject(line, { x: 20, y: -10 })).toMatchObject({
      start: { x: 20, y: -10 },
      end: { x: 120, y: -10 },
    });
    expect(objectBounds(line)).toEqual({ x: -2, y: -2, width: 104, height: 4 });
    expect(hitTestObject(line, { x: 50, y: 3 }, 1)).toBe(true);
    expect(hitTestObject(line, { x: 50, y: 5 }, 1)).toBe(false);
  });
});
