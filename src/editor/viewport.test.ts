import { describe, expect, it } from 'vitest';
import { fitViewport, panViewport, zoomViewport } from './viewport';

describe('canvas camera', () => {
  it('keeps the world point beneath the pointer stationary when zooming', () => {
    const camera = { x: 120, y: -40, scale: 0.5 };
    const pointer = { x: 380, y: 210 };
    const next = zoomViewport(camera, pointer, 2);
    expect((pointer.x - next.x) / next.scale).toBe((pointer.x - camera.x) / camera.scale);
    expect((pointer.y - next.y) / next.scale).toBe((pointer.y - camera.y) / camera.scale);
  });

  it('fits negative-origin content without cropping any edge', () => {
    const bounds = { x: -200, y: -100, width: 1400, height: 900 };
    const view = fitViewport(bounds, { width: 900, height: 700 });
    expect(view.x + bounds.x * view.scale).toBeGreaterThanOrEqual(48);
    expect(view.y + bounds.y * view.scale).toBeGreaterThanOrEqual(48);
    expect(view.x + (bounds.x + bounds.width) * view.scale).toBeLessThanOrEqual(852);
    expect(view.y + (bounds.y + bounds.height) * view.scale).toBeLessThanOrEqual(652);
  });

  it('pans in screen pixels without changing document scale', () => {
    expect(panViewport({ x: 100, y: 200, scale: 2 }, { x: -35, y: 60 })).toEqual({
      x: 65,
      y: 260,
      scale: 2,
    });
  });

  it('supports close detail zoom and bounds extreme inputs', () => {
    const view = { x: 0, y: 0, scale: 1 };
    expect(zoomViewport(view, { x: 0, y: 0 }, 16).scale).toBe(16);
    expect(zoomViewport(view, { x: 0, y: 0 }, 100).scale).toBe(30);
    expect(zoomViewport(view, { x: 0, y: 0 }, 0).scale).toBe(0.01);
  });
});
