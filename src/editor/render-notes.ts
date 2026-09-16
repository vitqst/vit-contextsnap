import { drawLabelText } from './render-label';
import type { DrawingObject, Rect, StickyObject } from '../core/model';
import { getNoteLayout, NOTE_FONT_FAMILY, stickyTextColor } from '../core/notes';
import { applyObjectShadow, clearShadow, shadowAllowedAt } from './render-shadow';
import { objectShadow, shadowBounds } from '../core/shadows';

/** A card and its text share the selected shadow mode, isolated from later objects. */
export function drawSticky(
  ctx: CanvasRenderingContext2D,
  object: StickyObject,
  bounds?: Rect,
  textShadows = true,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  applyObjectShadow(ctx, object.style, object.type);
  const { x, y, width, height } = object.rect;
  ctx.fillStyle = object.style.color || '#ffe58f';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(6, width / 2, height / 2));
  ctx.fill();
  clearShadow(ctx);
  drawNoteText(ctx, object, stickyTextColor(object.style.color || '#ffe58f'), bounds, textShadows);
  ctx.restore();
}

/** Attached notes are content, so preview and PNG export use exactly the same layout. */
export function drawShapeNote(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  bounds?: Rect,
  privacy: readonly DrawingObject[] = [],
): void {
  if (object.type === 'arrow' || object.type === 'text' || object.type === 'sticky') return;
  if (!object.note?.trim()) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  clearShadow(ctx);
  const layout = getNoteLayout(object, bounds);
  const shadows = shadowAllowedAt(shadowBounds(layout.rect, objectShadow(object.style)), privacy);
  drawLabelText(ctx, layout, object.style.color, object.style, shadows);
  ctx.restore();
}

function drawNoteText(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  color: string,
  bounds?: Rect,
  shadows = true,
): void {
  const { rect, center, lines, fontSize, lineHeight } = getNoteLayout(object, bounds);
  if (!lines.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  if (shadows) applyObjectShadow(ctx, object.style);
  else clearShadow(ctx);
  ctx.font = `500 ${fontSize}px ${NOTE_FONT_FAMILY}`;
  ctx.fontKerning = 'normal';
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
