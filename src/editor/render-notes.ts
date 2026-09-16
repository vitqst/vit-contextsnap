import { drawLabelText } from './render-label';
import type { DrawingObject, Rect, StickyObject } from '../core/model';
import { getNoteLayout, NOTE_FONT_FAMILY, stickyTextColor } from '../core/notes';

/** Shadows belong to the card surface only; text and later drawing objects stay flat. */
export function drawSticky(
  ctx: CanvasRenderingContext2D,
  object: StickyObject,
  bounds?: Rect,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  clearShadow(ctx);
  if (object.style.shadow !== false) {
    // Shadow blur and offsets are raster-space values, not transformed path units.
    const transform = ctx.getTransform();
    const rasterScale = Math.hypot(transform.a, transform.b);
    ctx.shadowColor = 'rgba(24, 24, 38, 0.22)';
    ctx.shadowBlur = 14 * rasterScale;
    ctx.shadowOffsetX = 5 * transform.c;
    ctx.shadowOffsetY = 5 * transform.d;
  }
  const { x, y, width, height } = object.rect;
  ctx.fillStyle = object.style.color || '#ffe58f';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(6, width / 2, height / 2));
  ctx.fill();
  clearShadow(ctx);
  drawNoteText(ctx, object, stickyTextColor(object.style.color || '#ffe58f'), bounds);
  ctx.restore();
}

/** Attached notes are content, so preview and PNG export use exactly the same layout. */
export function drawShapeNote(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  bounds?: Rect,
): void {
  if (object.type === 'arrow' || object.type === 'text' || object.type === 'sticky') return;
  if (!object.note?.trim()) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  clearShadow(ctx);
  drawLabelText(ctx, getNoteLayout(object, bounds), object.style.color);
  ctx.restore();
}

function drawNoteText(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  color: string,
  bounds?: Rect,
): void {
  const { rect, center, lines, fontSize, lineHeight } = getNoteLayout(object, bounds);
  if (!lines.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.font = `500 ${fontSize}px ${NOTE_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const textHeight = lines.length * lineHeight;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const y = center.y - textHeight / 2 + (index + 0.5) * lineHeight;
    ctx.fillText(line, center.x, y, rect.width);
  }
  ctx.restore();
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}
