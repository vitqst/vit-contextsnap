import type { MagnifierObject, Point, Rect } from './model';
import { distance } from './geometry';
import { imageHandles, type ImageHandle } from './image-geometry';

export type CropHandle = ImageHandle | 'n' | 'e' | 's' | 'w';

export function cropHandles(rect: Rect): Record<CropHandle, Point> {
  return {
    ...imageHandles(rect),
    n: { x: rect.x + rect.width / 2, y: rect.y },
    e: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
    s: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
    w: { x: rect.x, y: rect.y + rect.height / 2 },
  };
}

export function hitTestCropHandle(rect: Rect, point: Point, tolerance: number): CropHandle | null {
  const radius = Math.min(tolerance, Math.min(rect.width, rect.height) / 3);
  const handles = cropHandles(rect);
  return (
    (Object.keys(handles) as CropHandle[]).find(
      (handle) => distance(handles[handle], point) <= radius,
    ) ?? null
  );
}

/** Fixed opposite edges, source-coordinate bounds, and a 4px exportable minimum. */
export function resizeCrop(rect: Rect, handle: CropHandle, delta: Point, bounds: Rect): Rect {
  const limits = includeCurrentCrop(rect, bounds);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes('w')) left = Math.max(limits.x, Math.min(right - 4, left + delta.x));
  if (handle.includes('e'))
    right = Math.min(limits.x + limits.width, Math.max(left + 4, right + delta.x));
  if (handle.includes('n')) top = Math.max(limits.y, Math.min(bottom - 4, top + delta.y));
  if (handle.includes('s'))
    bottom = Math.min(limits.y + limits.height, Math.max(top + 4, bottom + delta.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function moveCrop(rect: Rect, delta: Point, bounds: Rect): Rect {
  const limits = includeCurrentCrop(rect, bounds);
  return {
    ...rect,
    x: Math.max(limits.x, Math.min(limits.x + limits.width - rect.width, rect.x + delta.x)),
    y: Math.max(limits.y, Math.min(limits.y + limits.height - rect.height, rect.y + delta.y)),
  };
}

/** Crops can outlive expanded objects that were subsequently moved or removed. */
function includeCurrentCrop(rect: Rect, bounds: Rect): Rect {
  const x = Math.min(rect.x, bounds.x);
  const y = Math.min(rect.y, bounds.y);
  return {
    x,
    y,
    width: Math.max(rect.x + rect.width, bounds.x + bounds.width) - x,
    height: Math.max(rect.y + rect.height, bounds.y + bounds.height) - y,
  };
}

export function magnifierHandles(lens: MagnifierObject): Point[] {
  const { center, radius } = lens;
  return [
    { x: center.x - radius, y: center.y },
    { x: center.x + radius, y: center.y },
    { x: center.x, y: center.y - radius },
    { x: center.x, y: center.y + radius },
  ];
}

/** Use radial movement, not the raw pointer radius, so near-handle clicks never jump. */
export function resizeMagnifier(
  lens: MagnifierObject,
  start: Point,
  point: Point,
): MagnifierObject {
  const change = distance(lens.center, point) - distance(lens.center, start);
  return { ...lens, radius: Math.max(32, Math.min(180, lens.radius + change)) };
}
