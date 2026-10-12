import type { LineHandle, LineObject, Point } from './model';

const SNAP_ANGLE = Math.PI / 4;

/** Snap around the fixed endpoint without changing the gesture's radial length. */
export function snapLinePoint(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (!length) return { ...origin };
  const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE;
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

export function moveLineHandle(
  line: LineObject,
  handle: LineHandle,
  point: Point,
  snap: boolean,
): LineObject {
  const fixed = handle === 'start' ? line.end : line.start;
  return { ...line, [handle]: snap ? snapLinePoint(fixed, point) : { ...point } };
}
