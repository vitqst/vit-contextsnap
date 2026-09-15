import { describe, expect, it } from 'vitest';
import { blurSampleBounds, magnifierSourceRect } from './render-effects';

describe('effect source sampling', () => {
  it('maps a 2x circular lens to screenshot coordinates independently of output crop', () => {
    const source = magnifierSourceRect({ x: 330, y: 280 }, 72, 2);
    expect(source).toEqual({ x: 294, y: 244, width: 72, height: 72 });
    // Destination x=388 samples x=359: a pixel outside the original blue block becomes blue.
    expect(source.x + ((388 - (330 - 72)) / 144) * source.width).toBe(359);
  });

  it('retains off-image lens coordinates so clipping does not stretch edge pixels', () => {
    expect(magnifierSourceRect({ x: 10, y: 10 }, 60, 2)).toEqual({
      x: -20,
      y: -20,
      width: 60,
      height: 60,
    });
  });

  it('includes neighboring source pixels for Gaussian blur but bounds temporary patches', () => {
    expect(
      blurSampleBounds({ x: 200, y: 180, width: 200, height: 200 }, 12, {
        width: 960,
        height: 640,
      }),
    ).toEqual({ x: 164, y: 144, width: 272, height: 272 });
    expect(
      blurSampleBounds({ x: 0, y: 0, width: 50, height: 50 }, 32, { width: 960, height: 640 }),
    ).toEqual({ x: 0, y: 0, width: 146, height: 146 });
  });

  it('does not allocate a patch for an effect completely outside the screenshot', () => {
    expect(
      blurSampleBounds({ x: 2000, y: 2000, width: 100, height: 100 }, 12, {
        width: 960,
        height: 640,
      }),
    ).toEqual({ x: 960, y: 640, width: 0, height: 0 });
  });
});
