import { describe, expect, it } from 'vitest';
import { blurPixels } from './blur';

function solid(width: number, height: number, rgba: number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { data, width, height };
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number) {
  return Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
}

describe('pixel blur for WebViews without canvas filters', () => {
  it('spreads source detail in both axes without modifying the source pixels', () => {
    const input = solid(11, 11, [0, 0, 0, 255]);
    input.data.set([255, 0, 0, 255], (5 * 11 + 5) * 4);
    const original = input.data.slice();
    const output = blurPixels(input, 1);

    expect(pixel(output, 11, 5, 5)[0]).toBeGreaterThan(0);
    expect(pixel(output, 11, 5, 5)[0]).toBeLessThan(25);
    expect(pixel(output, 11, 5, 4)[0]).toBeGreaterThan(0);
    expect(pixel(output, 11, 4, 5)).toEqual(pixel(output, 11, 5, 4));
    expect(pixel(output, 11, 5, 1)[0]).toBe(0);
    expect(input.data).toEqual(original);
    expect(blurPixels(input, 1)).toEqual(output);
  });

  it('preserves flat opaque interior colors and samples transparent pixels outside the image', () => {
    const output = blurPixels(solid(11, 11, [24, 100, 211, 255]), 1);
    expect(pixel(output, 11, 5, 5)).toEqual([24, 100, 211, 255]);
    const corner = pixel(output, 11, 0, 0);
    expect(corner.slice(0, 3)).toEqual([24, 100, 211]);
    expect(corner[3]).toBeGreaterThan(0);
    expect(corner[3]).toBeLessThan(255);
  });

  it('does not bleed hidden RGB values from transparent pixels into visible pixels', () => {
    const input = solid(11, 11, [255, 0, 0, 0]);
    input.data.set([0, 0, 255, 255], (5 * 11 + 5) * 4);
    const output = blurPixels(input, 1);
    expect(pixel(output, 11, 5, 5)).toEqual([0, 0, 255, expect.any(Number)]);
    expect(pixel(output, 11, 4, 5)[2]).toBe(255);
    for (let i = 0; i < output.length; i += 4) expect(output[i]).toBe(0);
  });

  it('handles images narrower than the blur radius without reading invalid pixels', () => {
    const output = blurPixels(solid(1, 2, [0, 0, 0, 255]), 32);
    expect(output).toHaveLength(8);
    expect(Array.from(output)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('returns an independent unchanged copy for zero radius', () => {
    const input = solid(1, 1, [24, 100, 211, 255]);
    const output = blurPixels(input, 0);
    expect(output).toEqual(input.data);
    expect(output).not.toBe(input.data);
  });

  it('rejects inconsistent image data or unbounded radii before allocating', () => {
    expect(() => blurPixels({ data: new Uint8ClampedArray(4), width: 2, height: 2 }, 1)).toThrow();
    expect(() => blurPixels(solid(1, 1, [0, 0, 0, 255]), Infinity)).toThrow();
    expect(() => blurPixels(solid(1, 1, [0, 0, 0, 255]), 33)).toThrow();
  });
});
