import { describe, expect, it } from 'vitest';
import { arrowControl, arrowMode, withArrowMode } from './arrows';
import type { ArrowObject } from './model';

const arrow: ArrowObject = {
  id: 'arrow',
  seed: 1,
  type: 'arrow',
  style: { color: '#e05252', width: 4, sketch: true, shadow: false },
  start: { x: 100, y: 100 },
  end: { x: 500, y: 300 },
  control: { x: 260, y: 280 },
  label: 'Keep this attached',
  labelFontSize: 24,
  labelOffset: { x: 30, y: -20 },
};

describe('arrow mode', () => {
  it('recognizes old midpoint-control arrows as straight', () => {
    expect(arrowMode({ ...arrow, control: { x: 300, y: 200 } })).toBe('straight');
  });

  it('recognizes existing bent arrows as curved', () => {
    expect(arrowMode(arrow)).toBe('curved');
  });

  it('gives an explicit mode precedence over retained control coordinates', () => {
    expect(arrowMode({ ...arrow, mode: 'straight' })).toBe('straight');
    expect(arrowMode({ ...arrow, mode: 'curved', control: { x: 300, y: 200 } })).toBe('curved');
  });

  it('uses the endpoint midpoint for straight rendering without discarding the stored bend', () => {
    const straight: ArrowObject = { ...arrow, mode: 'straight' };
    expect(arrowControl(straight)).toEqual({ x: 300, y: 200 });
    expect(straight.control).toEqual(arrow.control);
  });

  it('uses the stored control for curved rendering', () => {
    expect(arrowControl(arrow)).toEqual(arrow.control);
  });

  it('switches to straight and back without changing endpoints, label, font, or shadow', () => {
    const straight = withArrowMode(arrow, 'straight');
    expect(straight).toEqual({ ...arrow, mode: 'straight' });
    expect(arrowControl(straight)).toEqual({ x: 300, y: 200 });
    const curved = withArrowMode(straight, 'curved');
    expect(curved).toEqual({ ...arrow, mode: 'curved' });
    expect(arrowControl(curved)).toEqual(arrow.control);
    expect(arrow.mode).toBeUndefined();
  });

  it('creates a modest perpendicular bend when a straight arrow has none to restore', () => {
    const straight: ArrowObject = { ...arrow, mode: 'straight', control: { x: 300, y: 200 } };
    const curved = withArrowMode(straight, 'curved');
    expect(curved.mode).toBe('curved');
    expect(curved.start).toEqual(straight.start);
    expect(curved.end).toEqual(straight.end);
    expect(curved.control).toEqual({ x: 268, y: 264 });
    expect(straight.control).toEqual({ x: 300, y: 200 });
  });

  it('keeps a zero-length arrow finite when changing modes', () => {
    const point = { x: 100, y: 100 };
    const curved = withArrowMode({ ...arrow, start: point, end: point, control: point }, 'curved');
    expect(curved.mode).toBe('curved');
    expect(arrowControl(curved)).toEqual(point);
  });
});
