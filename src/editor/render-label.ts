import { LABEL_FONT_FAMILY, type LabelLayout } from '../core/label-layout';

/** Every shape label is plain colored text, with no surface, halo or shadow. */
export function drawLabelText(
  ctx: CanvasRenderingContext2D,
  layout: LabelLayout,
  color: string,
): void {
  const { rect, center, fontSize, lineHeight, lines } = layout;
  if (!lines.length) return;
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.font = `500 ${fontSize}px ${LABEL_FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  const height = lines.length * lineHeight;
  for (let index = 0; index < lines.length; index++) {
    ctx.fillText(lines[index] ?? '', center.x, center.y - height / 2 + lineHeight * (index + 0.5));
  }
  ctx.restore();
}
