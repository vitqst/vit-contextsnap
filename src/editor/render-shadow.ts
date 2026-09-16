import type { DrawingObject, ObjectStyle, Rect } from '../core/model';
import { objectShadow, shadowBounds } from '../core/shadows';

export function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** A glyph-derived shadow must not reveal a shape covered by an opaque mask. */
export function shadowAllowedAt(bounds: Rect, privacy: readonly DrawingObject[]): boolean {
  return !privacy.some((object) => {
    if (object.type !== 'redact') return false;
    const left = Math.floor(object.rect.x);
    const top = Math.floor(object.rect.y);
    return (
      bounds.x < Math.ceil(object.rect.x + object.rect.width) &&
      bounds.y < Math.ceil(object.rect.y + object.rect.height) &&
      bounds.x + bounds.width > left &&
      bounds.y + bounds.height > top
    );
  });
}

export function applyObjectShadow(
  ctx: CanvasRenderingContext2D,
  style: ObjectStyle,
  type?: DrawingObject['type'],
): void {
  clearShadow(ctx);
  const shadow = objectShadow(style, type);
  if (!shadow) return;
  // Canvas shadows ignore the drawing transform. Convert world dimensions to
  // backing pixels once, keeping zoomed/HiDPI previews equivalent to export.
  const transform = ctx.getTransform();
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur * Math.hypot(transform.a, transform.b);
  ctx.shadowOffsetX = shadow.x * transform.a + shadow.y * transform.c;
  ctx.shadowOffsetY = shadow.x * transform.b + shadow.y * transform.d;
}

/** Image/effect cards cast geometry-only exterior shadows, never sampled private pixels. */
export function drawMaskShadow(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  style: ObjectStyle,
): void {
  const shadow = objectShadow(style);
  if (!shadow) return;
  const outer = shadowBounds(rect, shadow);
  ctx.save();
  ctx.beginPath();
  ctx.rect(outer.x - 1, outer.y - 1, outer.width + 2, outer.height + 2);
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip('evenodd');
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  applyObjectShadow(ctx, style);
  ctx.fillStyle = '#000000';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}
