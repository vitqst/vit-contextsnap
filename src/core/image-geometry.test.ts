import { describe, expect, it } from 'vitest';
import {
  hitTestImageHandle,
  imageHandles,
  placeImage,
  resizeImageRect,
  type ImageHandle,
} from './image-geometry';
import type { Point, Rect } from './model';

const rect: Rect = { x: 20, y: 30, width: 200, height: 100 };
const opposite: Record<ImageHandle, ImageHandle> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

describe('image handle hit testing', () => {
  const small = { x: 20, y: 30, width: 30, height: 20 };

  it('leaves the center of a small image available for body dragging at 50% zoom', () => {
    expect(hitTestImageHandle(small, { x: 35, y: 40 }, 22)).toBeNull();
  });

  it.each<ImageHandle>(['nw', 'ne', 'se', 'sw'])(
    'still finds the exact %s corner of a small image',
    (handle) => {
      expect(hitTestImageHandle(small, imageHandles(small)[handle], 22)).toBe(handle);
    },
  );

  it('retains ordinary near-corner targets while respecting the requested tolerance', () => {
    expect(hitTestImageHandle(rect, { x: 25, y: 35 }, 11)).toBe('nw');
    expect(hitTestImageHandle(rect, { x: 225, y: 135 }, 11)).toBe('se');
    expect(hitTestImageHandle(rect, { x: 25, y: 35 }, 4)).toBeNull();
    expect(hitTestImageHandle(rect, { x: 120, y: 80 }, 11)).toBeNull();
  });

  it('caps overlapping targets relative to the shorter image side', () => {
    expect(hitTestImageHandle(small, { x: 26, y: 30 }, 22)).toBe('nw');
    expect(hitTestImageHandle(small, { x: 27, y: 30 }, 22)).toBeNull();
  });
});

describe('image handles and proportional resizing', () => {
  it('places four corner handles in source-image coordinates', () => {
    expect(imageHandles(rect)).toEqual({
      nw: { x: 20, y: 30 },
      ne: { x: 220, y: 30 },
      se: { x: 220, y: 130 },
      sw: { x: 20, y: 130 },
    });
  });

  it.each<[ImageHandle, Point, Rect]>([
    ['nw', { x: -80, y: -20 }, { x: -80, y: -20, width: 300, height: 150 }],
    ['ne', { x: 320, y: -20 }, { x: 20, y: -20, width: 300, height: 150 }],
    ['se', { x: 320, y: 180 }, { x: 20, y: 30, width: 300, height: 150 }],
    ['sw', { x: -80, y: 180 }, { x: -80, y: 30, width: 300, height: 150 }],
  ])('resizes %s proportionally around its fixed opposite corner', (handle, point, expected) => {
    const resized = resizeImageRect(rect, handle, point);
    expect(resized).toEqual(expected);
    expect(imageHandles(resized)[opposite[handle]]).toEqual(imageHandles(rect)[opposite[handle]]);
    expect(resized.width / resized.height).toBe(2);
    expect(rect).toEqual({ x: 20, y: 30, width: 200, height: 100 });
  });

  it('projects an off-diagonal pointer onto the proportional resize diagonal', () => {
    expect(resizeImageRect(rect, 'se', { x: 320, y: 130 })).toEqual({
      x: 20,
      y: 30,
      width: 280,
      height: 140,
    });
  });

  it.each<ImageHandle>(['nw', 'ne', 'se', 'sw'])(
    'holds an 8px short-side minimum when %s crosses its anchor without flipping',
    (handle) => {
      const anchor = imageHandles(rect)[opposite[handle]];
      const corner = imageHandles(rect)[handle];
      const point = { x: anchor.x * 2 - corner.x, y: anchor.y * 2 - corner.y };
      const resized = resizeImageRect(rect, handle, point);
      expect(resized.width).toBe(16);
      expect(resized.height).toBe(8);
      expect(imageHandles(resized)[opposite[handle]]).toEqual(anchor);
      expect(imageHandles(resized)[handle].x < anchor.x).toBe(corner.x < anchor.x);
      expect(imageHandles(resized)[handle].y < anchor.y).toBe(corner.y < anchor.y);
    },
  );

  it('preserves the rectangle reference when the handle has not moved', () => {
    expect(resizeImageRect(rect, 'se', imageHandles(rect).se)).toBe(rect);
  });

  it('does not enlarge an already-tiny image just to reach the resize minimum', () => {
    const tiny = { x: 20, y: 30, width: 2, height: 1 };
    expect(resizeImageRect(tiny, 'se', { x: 20, y: 30 })).toBe(tiny);
  });
});

describe('initial image placement', () => {
  const bounds = { x: 100, y: 200, width: 800, height: 600 };

  it('fits a landscape image to half the bounds and centers inside a crop', () => {
    expect(placeImage({ width: 4000, height: 2000 }, bounds)).toEqual({
      x: 300,
      y: 400,
      width: 400,
      height: 200,
    });
  });

  it('fits a portrait image by height while preserving its aspect ratio', () => {
    expect(placeImage({ width: 2000, height: 4000 }, bounds)).toEqual({
      x: 425,
      y: 350,
      width: 150,
      height: 300,
    });
  });

  it('does not upscale a small imported image', () => {
    expect(placeImage({ width: 80, height: 40 }, bounds)).toEqual({
      x: 460,
      y: 480,
      width: 80,
      height: 40,
    });
  });

  it('uses the requested center while keeping the initial rectangle inside bounds', () => {
    const size = { width: 4000, height: 2000 };
    expect(placeImage(size, bounds, { x: 100, y: 200 })).toEqual({
      x: 100,
      y: 200,
      width: 400,
      height: 200,
    });
    expect(placeImage(size, bounds, { x: 1000, y: 1000 })).toEqual({
      x: 500,
      y: 600,
      width: 400,
      height: 200,
    });
  });
});
