import { LABEL_FONT_FAMILY, type LabelLayout } from '../core/label-layout';
import type { ObjectStyle } from '../core/model';
import { objectShadow, shadowBounds } from '../core/shadows';
import { applyObjectShadow, clearShadow } from './render-shadow';

/** Labels remain plain colored text; their owner's shadow setting is shared. */
export function drawLabelText(
  ctx: CanvasRenderingContext2D,
  layout: LabelLayout,
  color: string,
  style: ObjectStyle,
  shadows = true,
): void {
  const { rect, center, fontSize, lineHeight, lines } = layout;
  if (!lines.length) return;
  ctx.save();
  if (shadows) applyObjectShadow(ctx, style);
  else clearShadow(ctx);
  const clip = shadowBounds(rect, shadows ? objectShadow(style) : null);
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.width, clip.height);
  ctx.clip();
  ctx.font = `500 ${fontSize}px ${LABEL_FONT_FAMILY}`;
  ctx.fontKerning = 'normal';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  const height = lines.length * lineHeight;
  for (let index = 0; index < lines.length; index++) {
    ctx.fillText(lines[index] ?? '', center.x, center.y - height / 2 + lineHeight * (index + 0.5));
  }
  ctx.restore();
}
