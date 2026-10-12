import { describe, expect, it } from 'vitest';
import { arrowAppearance, arrowDirection, arrowHeads, boldArrowOutline } from './arrow-shape';
import type { ArrowObject } from './model';

const arrow: ArrowObject = {
  id: 'arrow',
  seed: 1,
  type: 'arrow',
  style: { color: '#ff3344', width: 6, sketch: false },
  start: { x: 10, y: 100 },
  end: { x: 210, y: 100 },
  control: { x: 110, y: 100 },
  mode: 'straight',
  label: '',
  labelOffset: { x: 0, y: 0 },
};

describe('arrow appearance geometry', () => {
  it('keeps legacy arrows one-way and standard', () => {
    expect(arrowDirection(arrow)).toBe('one-way');
    expect(arrowAppearance(arrow)).toBe('standard');
    const heads = arrowHeads(arrow);
    expect(heads).toHaveLength(1);
    expect(heads[0]!.tip).toEqual(arrow.end);
  });

  it('adds a matching start head for two-way standard arrows', () => {
    const heads = arrowHeads({ ...arrow, direction: 'two-way' });
    expect(heads).toHaveLength(2);
    expect(heads.map((head) => head.tip)).toEqual([arrow.start, arrow.end]);
    expect(heads[0]!.corners.every((point) => point.x > arrow.start.x)).toBe(true);
    expect(heads[1]!.corners.every((point) => point.x < arrow.end.x)).toBe(true);
  });

  it('uses the chord for an end head when the control point equals the end', () => {
    const vertical = {
      ...arrow,
      start: { x: 40, y: 20 },
      end: { x: 40, y: 180 },
      control: { x: 40, y: 180 },
      mode: 'curved' as const,
    };
    const [head] = arrowHeads(vertical);
    expect(head!.corners.every((point) => point.y < vertical.end.y)).toBe(true);
  });

  it('uses the chord for a start head when the control point equals the start', () => {
    const vertical = {
      ...arrow,
      start: { x: 40, y: 20 },
      end: { x: 40, y: 180 },
      control: { x: 40, y: 20 },
      mode: 'curved' as const,
      direction: 'two-way' as const,
    };
    const [head] = arrowHeads(vertical);
    expect(head!.corners.every((point) => point.y > vertical.start.y)).toBe(true);
  });

  it('builds a wide closed tapered outline for one-way bold arrows', () => {
    const points = boldArrowOutline({ ...arrow, appearance: 'bold' });
    expect(points.length).toBeGreaterThan(12);
    expect(points[0]).toEqual(arrow.start);
    expect(points.at(-1)).toEqual(arrow.start);
    expect(points.some((point) => Math.abs(point.y - 100) > 12)).toBe(true);
    expect(points).toContainEqual(arrow.end);
  });

  it('keeps heads at both ends and follows a curved arrow', () => {
    const curved = {
      ...arrow,
      direction: 'two-way' as const,
      appearance: 'bold' as const,
      mode: 'curved' as const,
      control: { x: 110, y: 20 },
    };
    const points = boldArrowOutline(curved);
    expect(points).toContainEqual(curved.start);
    expect(points).toContainEqual(curved.end);
    expect(Math.min(...points.map((point) => point.y))).toBeLessThan(80);
    expect(points.at(-1)).toEqual(curved.start);
  });
});
