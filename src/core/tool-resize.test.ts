import { describe, expect, it } from 'vitest';
import {
  cropHandles,
  hitTestCropHandle,
  magnifierHandles,
  moveCrop,
  resizeCrop,
  resizeMagnifier,
  type CropHandle,
} from './tool-resize';
import { DEFAULT_STYLE, type MagnifierObject, type Rect } from './model';

const crop: Rect = { x: 100, y: 80, width: 200, height: 120 };
const bounds: Rect = { x: -50, y: -30, width: 600, height: 400 };

describe('crop resizing', () => {
  it.each<CropHandle>(['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'])(
    'recognizes the %s handle while keeping the center draggable',
    (handle) => {
      expect(hitTestCropHandle(crop, cropHandles(crop)[handle], 11)).toBe(handle);
      expect(hitTestCropHandle(crop, { x: 200, y: 140 }, 500)).toBeNull();
    },
  );

  it('keeps opposite edges fixed and changes only the requested axis for an edge handle', () => {
    expect(resizeCrop(crop, 'nw', { x: -20, y: -30 }, bounds)).toEqual({
      x: 80,
      y: 50,
      width: 220,
      height: 150,
    });
    expect(resizeCrop(crop, 'e', { x: 35, y: 80 }, bounds)).toEqual({
      ...crop,
      width: 235,
    });
    expect(resizeCrop(crop, 's', { x: 35, y: 80 }, bounds)).toEqual({
      ...crop,
      height: 200,
    });
  });

  it('clamps to expanded negative bounds and prevents crossing fixed edges', () => {
    expect(resizeCrop(crop, 'nw', { x: -1000, y: -1000 }, bounds)).toEqual({
      x: -50,
      y: -30,
      width: 350,
      height: 230,
    });
    expect(resizeCrop(crop, 'nw', { x: 1000, y: 1000 }, bounds)).toEqual({
      x: 296,
      y: 196,
      width: 4,
      height: 4,
    });
    expect(resizeCrop(crop, 'se', { x: -1000, y: -1000 }, bounds)).toEqual({
      ...crop,
      width: 4,
      height: 4,
    });
  });

  it('moves without changing size and stops at all document edges', () => {
    expect(moveCrop(crop, { x: 12, y: 18 }, bounds)).toEqual({ ...crop, x: 112, y: 98 });
    expect(moveCrop(crop, { x: -1000, y: -1000 }, bounds)).toEqual({ ...crop, x: -50, y: -30 });
    expect(moveCrop(crop, { x: 1000, y: 1000 }, bounds)).toEqual({ ...crop, x: 350, y: 250 });
  });

  it('keeps an existing crop valid when expanded content has been deleted or moved away', () => {
    const outside = { x: -80, y: 20, width: 50, height: 50 };
    const contracted = { x: 0, y: 0, width: 100, height: 100 };
    expect(resizeCrop(outside, 'w', { x: 1, y: 0 }, contracted)).toEqual({
      ...outside,
      x: -79,
      width: 49,
    });
    expect(resizeCrop(outside, 'e', { x: 50, y: 0 }, contracted)).toEqual({
      ...outside,
      width: 100,
    });
    expect(moveCrop(outside, { x: 0, y: 1 }, contracted)).toEqual({ ...outside, y: 21 });
    const beyondBottom = { x: 130, y: 150, width: 40, height: 60 };
    expect(resizeCrop(beyondBottom, 'se', { x: -1, y: -1 }, contracted)).toEqual({
      ...beyondBottom,
      width: 39,
      height: 59,
    });
  });
});

describe('magnifier resizing', () => {
  const lens: MagnifierObject = {
    id: 'lens',
    seed: 1,
    style: DEFAULT_STYLE,
    type: 'magnifier',
    center: { x: 400, y: 300 },
    radius: 72,
    zoom: 2.5,
    note: 'Detail',
  };

  it('provides four equally spaced handles on the actual lens rim', () => {
    expect(magnifierHandles(lens)).toEqual([
      { x: 328, y: 300 },
      { x: 472, y: 300 },
      { x: 400, y: 228 },
      { x: 400, y: 372 },
    ]);
  });

  it('resizes radially without moving the center or changing magnification and notes', () => {
    expect(resizeMagnifier(lens, { x: 472, y: 300 }, { x: 530, y: 300 })).toEqual({
      ...lens,
      radius: 130,
    });
  });

  it('preserves near-handle grab offsets and follows the size slider limits', () => {
    expect(resizeMagnifier(lens, { x: 477, y: 300 }, { x: 477, y: 300 })).toEqual(lens);
    expect(resizeMagnifier(lens, { x: 472, y: 300 }, { x: 400, y: 300 }).radius).toBe(32);
    expect(resizeMagnifier(lens, { x: 472, y: 300 }, { x: 900, y: 300 }).radius).toBe(180);
  });
});
