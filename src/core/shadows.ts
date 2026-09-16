import type { DrawingObject, ObjectStyle, Rect } from './model';

export interface ObjectShadow {
  blur: number;
  x: number;
  y: number;
  color: string;
}

/** Dimensions are source pixels; rendering and expanded exports share these presets. */
export function objectShadow(
  style: ObjectStyle,
  type?: DrawingObject['type'],
): ObjectShadow | null {
  if (style.shadow === false) return null;
  if (style.shadowKind === 'hard') return { blur: 0, x: 3, y: 3, color: 'rgba(24, 24, 38, 0.32)' };
  return type === 'sticky'
    ? { blur: 14, x: 0, y: 5, color: 'rgba(24, 24, 38, 0.22)' }
    : { blur: 5, x: 0, y: 2, color: 'rgba(24, 24, 38, 0.24)' };
}

export function shadowBounds(rect: Rect, shadow: ObjectShadow | null): Rect {
  if (!shadow) return { ...rect };
  // Canvas implementations truncate Gaussian shadows within two blur radii.
  // Keep this conservative margin independent of viewport scaling and DPI.
  const padding = shadow.blur * 2;
  const left = Math.min(0, shadow.x - padding);
  const top = Math.min(0, shadow.y - padding);
  const right = Math.max(0, shadow.x + padding);
  const bottom = Math.max(0, shadow.y + padding);
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: rect.width + right - left,
    height: rect.height + bottom - top,
  };
}
