import type { Point, Rect } from '../core/model';

export interface Viewport extends Point {
  scale: number;
}

export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 30;

export function fitViewport(bounds: Rect, size: { width: number; height: number }): Viewport {
  const scale = Math.max(
    MIN_ZOOM,
    Math.min(
      1,
      Math.max(1, size.width - 96) / bounds.width,
      Math.max(1, size.height - 96) / bounds.height,
    ),
  );
  return {
    x: (size.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (size.height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}

export function zoomViewport(view: Viewport, anchor: Point, requested: number): Viewport {
  const scale = Number.isFinite(requested)
    ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requested))
    : view.scale;
  const ratio = scale / view.scale;
  return {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    scale,
  };
}

export function panViewport(view: Viewport, delta: Point): Viewport {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y };
}
