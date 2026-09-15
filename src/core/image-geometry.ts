import type { Point, Rect } from './model';

export type ImageHandle = 'nw' | 'ne' | 'se' | 'sw';

const opposite: Record<ImageHandle, ImageHandle> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

export function imageHandles(rect: Rect): Record<ImageHandle, Point> {
  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height },
  };
}

/** Tolerance is in source pixels; small images keep a body-drag region between corner targets. */
export function hitTestImageHandle(
  rect: Rect,
  point: Point,
  tolerance: number,
): ImageHandle | null {
  const handles = imageHandles(rect);
  const radius = Math.min(tolerance, Math.min(rect.width, rect.height) / 3);
  for (const handle of Object.keys(handles) as ImageHandle[]) {
    const corner = handles[handle];
    if (Math.hypot(point.x - corner.x, point.y - corner.y) <= radius) return handle;
  }
  return null;
}

/** Keep the opposite corner fixed and project the pointer onto the aspect-ratio diagonal. */
export function resizeImageRect(rect: Rect, handle: ImageHandle, point: Point): Rect {
  const anchor = imageHandles(rect)[opposite[handle]];
  const directionX = handle === 'nw' || handle === 'sw' ? -1 : 1;
  const directionY = handle === 'nw' || handle === 'ne' ? -1 : 1;
  const diagonalSquared = rect.width ** 2 + rect.height ** 2;
  const projectedScale =
    ((point.x - anchor.x) * directionX * rect.width +
      (point.y - anchor.y) * directionY * rect.height) /
    diagonalSquared;
  // Tiny source images remain tiny until explicitly enlarged, rather than jumping on click.
  const minimumScale = Math.min(1, 8 / Math.min(rect.width, rect.height));
  const scale = Math.max(minimumScale, projectedScale);
  if (scale === 1) return rect;
  const width = rect.width * scale;
  const height = rect.height * scale;
  return {
    x: directionX < 0 ? anchor.x - width : anchor.x,
    y: directionY < 0 ? anchor.y - height : anchor.y,
    width,
    height,
  };
}

/** Start at most half as wide/tall as the scene, without upscaling decoded source pixels. */
export function placeImage(
  size: { width: number; height: number },
  bounds: Rect,
  center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
): Rect {
  const scale = Math.min(1, bounds.width / 2 / size.width, bounds.height / 2 / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, center.x - width / 2)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, center.y - height / 2)),
    width,
    height,
  };
}
