import { getStroke } from 'perfect-freehand';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BrushProperties } from '../editor/BrushProperties';
import { DEFAULT_BRUSH, normalizeBrush, penOutline, sampleStrokePoint } from './brush';
import type { BrushSettings, PenObject, StrokePoint } from './model';

function stroke(points: StrokePoint[], brush?: BrushSettings): PenObject {
  return {
    id: 'pen',
    seed: 1,
    type: 'pen',
    style: { color: '#ff0000', width: 8, sketch: false },
    points,
    brush,
  };
}

function horizontalSamples(pressure: number, input?: 'pen' | 'mouse'): StrokePoint[] {
  return Array.from({ length: 41 }, (_, index) => ({
    x: index * 10,
    y: 0,
    pressure,
    time: index * 20,
    input,
  }));
}

function sampledMousePath(interval: number): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let index = 0; index < 41; index++) {
    points.push(
      sampleStrokePoint(
        { x: index * 10, y: 0 },
        { pressure: 0.5, pointerType: 'mouse', timeStamp: index * interval },
        points.at(-1),
      ),
    );
  }
  return points;
}

function middleThickness(outline: number[][]): number {
  const middle = outline.filter(([x]) => x! > 100 && x! < 300);
  const ys = middle.map(([, y]) => y!);
  return Math.max(...ys) - Math.min(...ys);
}

describe('brush settings', () => {
  it('returns independent defaults and clamps influence ranges without accepting NaN', () => {
    expect(normalizeBrush()).toEqual(DEFAULT_BRUSH);
    expect(normalizeBrush()).not.toBe(DEFAULT_BRUSH);
    expect(normalizeBrush({ smoothing: 2, pressure: -1, speed: Number.NaN })).toEqual({
      smoothing: 1,
      pressure: 0,
      speed: DEFAULT_BRUSH.speed,
    });
  });

  it('renders three labeled adjustable sliders using normalized influence values', () => {
    const markup = renderToStaticMarkup(
      createElement(BrushProperties, {
        value: { smoothing: 0.6, pressure: 0.45, speed: 0.7 },
        onChange: () => undefined,
      }),
    );
    for (const label of ['Smoothing', 'Pressure influence', 'Speed influence']) {
      expect(markup).toContain(label);
    }
    expect(markup.match(/type="range"/g)).toHaveLength(3);
    expect(markup.match(/min="0" max="1" step="0.05"/g)).toHaveLength(3);
  });
});

describe('pointer pressure sampling', () => {
  it('retains actual pen pressure instead of replacing it with speed', () => {
    expect(
      sampleStrokePoint(
        { x: 30, y: 40 },
        { pressure: 0.82, pointerType: 'pen', timeStamp: 25 },
        { x: 0, y: 0, pressure: 0.3, time: 20, input: 'pen' },
      ),
    ).toEqual({ x: 30, y: 40, pressure: 0.82, time: 25, input: 'pen' });
  });

  it('uses elapsed time to make slow mouse movement thicker than a fast identical path', () => {
    const slow = sampledMousePath(80);
    const fast = sampledMousePath(4);
    expect(slow.at(-1)!.input).toBe('mouse');
    expect(slow.at(-1)!.pressure).toBeGreaterThan(fast.at(-1)!.pressure);
    expect(middleThickness(penOutline(stroke(slow)))).toBeGreaterThan(
      middleThickness(penOutline(stroke(fast))) * 1.5,
    );
  });

  it('falls back to speed when a pen provides no contact pressure', () => {
    const previous: StrokePoint = { x: 0, y: 0, pressure: 0.5, time: 0, input: 'mouse' };
    const slow = sampleStrokePoint(
      { x: 10, y: 0 },
      { pressure: 0, pointerType: 'pen', timeStamp: 100 },
      previous,
    );
    const fast = sampleStrokePoint(
      { x: 10, y: 0 },
      { pressure: 0, pointerType: 'pen', timeStamp: 2 },
      previous,
    );
    expect(slow.input).toBe('mouse');
    expect(slow.pressure).toBeGreaterThan(fast.pressure);
  });

  it('preserves the previous contact pressure and input kind at release', () => {
    const previous: StrokePoint = { x: 10, y: 20, pressure: 0.73, time: 30, input: 'pen' };
    expect(
      sampleStrokePoint(
        { x: 12, y: 23 },
        { pressure: 0, pointerType: 'pen', timeStamp: 35 },
        previous,
        true,
      ),
    ).toEqual({ x: 12, y: 23, pressure: 0.73, time: 35, input: 'pen' });
  });

  it('retains finite pressure on duplicate or backwards timestamps', () => {
    const previous: StrokePoint = { x: 10, y: 20, pressure: 0.73, time: 30, input: 'mouse' };
    for (const timeStamp of [30, 20, Number.NaN]) {
      const sample = sampleStrokePoint(
        { x: 12, y: 23 },
        { pressure: 0.5, pointerType: 'mouse', timeStamp },
        previous,
      );
      expect(sample.pressure).toBe(previous.pressure);
      expect(sample.time).toBe(30);
    }
  });
});

describe('deterministic pen outlines', () => {
  it('renders higher measured pressure wider and ignores speed influence for a real pen', () => {
    const settings = { smoothing: 0.6, pressure: 1, speed: 0 };
    const light = penOutline(stroke(horizontalSamples(0.15, 'pen'), settings));
    const firmObject = stroke(horizontalSamples(0.85, 'pen'), settings);
    const firm = penOutline(firmObject);
    expect(middleThickness(firm)).toBeGreaterThan(middleThickness(light) * 3);
    expect(penOutline({ ...firmObject, brush: { ...settings, speed: 1 } })).toEqual(firm);
  });

  it('zero pressure and speed influence gives constant width regardless of sampled pressure', () => {
    const settings = { smoothing: 0.6, pressure: 0, speed: 0 };
    expect(penOutline(stroke(horizontalSamples(0.15, 'pen'), settings))).toEqual(
      penOutline(stroke(horizontalSamples(0.85, 'pen'), settings)),
    );
    expect(penOutline(stroke(sampledMousePath(4), settings))).toEqual(
      penOutline(stroke(sampledMousePath(80), settings)),
    );
  });

  it('uses speed influence but not pressure influence for a mouse stroke', () => {
    const points = sampledMousePath(4);
    const settings = { smoothing: 0.6, pressure: 0, speed: 1 };
    const outline = penOutline(stroke(points, settings));
    expect(penOutline(stroke(points, { ...settings, pressure: 1 }))).toEqual(outline);
    expect(penOutline(stroke(points, { ...settings, speed: 0 }))).not.toEqual(outline);
  });

  it('preserves stored pressure and the legacy rendering defaults when input metadata is absent', () => {
    const points = horizontalSamples(0.8).map(({ x, y, pressure }) => ({ x, y, pressure }));
    const expected = getStroke(
      points.map(({ x, y, pressure }) => [x, y, pressure]),
      {
        size: 16,
        thinning: 0.45,
        smoothing: 0.6,
        streamline: 0.45,
        simulatePressure: false,
        last: true,
      },
    );
    const actual = penOutline(stroke(points));
    expect(actual).toHaveLength(expected.length);
    actual.forEach(([x, y], index) => {
      expect(x).toBeCloseTo(expected[index]![0]!, 10);
      expect(y).toBeCloseTo(expected[index]![1]!, 10);
    });
  });

  it('smooths both the centerline and edges while preserving deterministic history samples', () => {
    const points = horizontalSamples(0.5, 'pen').map((point, index) => ({
      ...point,
      y: index % 2 ? 8 : -8,
    }));
    const original = stroke(points, { smoothing: 0, pressure: 0, speed: 0 });
    const before = structuredClone(original);
    const smooth = { ...original, brush: { ...original.brush!, smoothing: 1 } };
    const rawOutline = penOutline(original);
    const smoothOutline = penOutline(smooth);
    expect(middleThickness(smoothOutline)).toBeLessThan(middleThickness(rawOutline));
    expect(smoothOutline).not.toEqual(rawOutline);
    expect(penOutline(smooth)).toEqual(smoothOutline);
    expect(original).toEqual(before);
  });

  it('keeps incomplete strokes separate from completed caps and handles empty strokes', () => {
    const object = stroke(horizontalSamples(0.5, 'pen'));
    expect(penOutline(object, false)).not.toEqual(penOutline(object, true));
    expect(penOutline(stroke([]))).toEqual([]);
  });
});
