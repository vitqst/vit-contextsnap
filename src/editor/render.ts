import { drawLabelText } from './render-label';
import rough from 'roughjs';
import { getArrowLabelLayout } from '../core/arrow-label';
import { arrowHeadPoints } from '../core/geometry';
import { arrowControl } from '../core/arrows';
import { penOutline } from '../core/brush';
import { drawShapeNote, drawSticky } from './render-notes';
import { objectsInPaintOrder } from '../core/layers';
import type {
  ArrowObject,
  DrawingObject,
  ObjectStyle,
  PenObject,
  Rect,
  StepObject,
  TextObject,
} from '../core/model';
import { drawMagnifier, drawRedaction, getEffectSource, sourceImageSize } from './render-effects';
import type { ImageAssets } from './image-assets';

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Draws only document content. Selection handles and editor overlays never enter this layer. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  sceneBounds?: Rect,
  assets?: ImageAssets,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.resetTransform();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  const source = getEffectSource(image, objects, assets);
  const bounds = sceneBounds ?? { x: 0, y: 0, ...sourceImageSize(image) };
  ctx.drawImage(source, 0, 0);
  // The same layer order drives hit testing. Lenses see the sanitized screenshot;
  // solid redaction always covers the original mask, even beneath a lens or label.
  for (const object of objectsInPaintOrder(objects)) {
    if (object.type === 'magnifier') drawMagnifier(ctx, source, object);
    else if (object.type === 'redact') drawRedaction(ctx, object.rect);
    else if (object.type !== 'blur' && object.type !== 'image') drawObject(ctx, object, bounds);
    if (object.note?.trim()) drawShapeNote(ctx, object, bounds);
  }
  ctx.restore();
}

export function drawObject(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  sceneBounds?: Rect,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = object.style.color;
  ctx.fillStyle = object.style.color;
  ctx.lineWidth = object.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  switch (object.type) {
    case 'arrow':
      drawArrow(ctx, object, sceneBounds);
      break;
    case 'pen':
      drawPen(ctx, object);
      break;
    case 'rectangle': {
      const { x, y, width, height } = object.rect;
      if (object.style.sketch) {
        rough
          .canvas(ctx.canvas)
          .rectangle(x, y, width, height, roughOptions(object.style, object.seed));
      } else {
        ctx.strokeRect(x, y, width, height);
      }
      break;
    }
    case 'redact': {
      drawRedaction(ctx, object.rect);
      break;
    }
    case 'step':
      drawStep(ctx, object);
      break;
    case 'blur':
    case 'magnifier':
    case 'image':
      // Image effects need the sanitized source and are composed by drawScene.
      break;
    case 'text':
      drawText(ctx, object);
      break;
    case 'sticky':
      drawSticky(ctx, object, sceneBounds);
      break;
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: ArrowObject, sceneBounds?: Rect): void {
  const control = arrowControl(arrow);
  if (arrow.style.shadow !== false) {
    ctx.shadowColor = 'rgba(24, 24, 38, 0.24)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
  }
  const [headA, headB] = arrowHeadPoints(arrow);
  if (arrow.style.sketch) {
    const path = [
      `M ${arrow.start.x} ${arrow.start.y}`,
      `Q ${control.x} ${control.y} ${arrow.end.x} ${arrow.end.y}`,
      `M ${headA.x} ${headA.y} L ${arrow.end.x} ${arrow.end.y} L ${headB.x} ${headB.y}`,
    ].join(' ');
    rough.canvas(ctx.canvas).path(path, roughOptions(arrow.style, arrow.seed));
  } else {
    ctx.beginPath();
    ctx.moveTo(arrow.start.x, arrow.start.y);
    ctx.quadraticCurveTo(control.x, control.y, arrow.end.x, arrow.end.y);
    ctx.moveTo(headA.x, headA.y);
    ctx.lineTo(arrow.end.x, arrow.end.y);
    ctx.lineTo(headB.x, headB.y);
    ctx.stroke();
  }
  if (arrow.label.trim()) drawArrowLabel(ctx, arrow, sceneBounds);
}

function drawArrowLabel(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowObject,
  sceneBounds?: Rect,
): void {
  drawLabelText(ctx, getArrowLabelLayout(arrow, sceneBounds), arrow.style.color);
}

function drawStep(ctx: CanvasRenderingContext2D, object: StepObject): void {
  const { center, radius } = object;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = object.style.color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
  const text = String(object.number);
  let fontSize = 20;
  ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  const measured = ctx.measureText(text).width;
  if (measured > radius * 1.45) fontSize *= (radius * 1.45) / measured;
  ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = stepTextColor(object.style.color);
  ctx.fillText(text, center.x, center.y + fontSize * 0.045);
}

function stepTextColor(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const channels = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const luminance =
    (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  return luminance > 0.62 ? '#252432' : '#ffffff';
}

function drawPen(ctx: CanvasRenderingContext2D, object: PenObject): void {
  if (!object.points.length) return;
  const outline = penOutline(object);
  const first = outline[0];
  if (!first || first[0] === undefined || first[1] === undefined) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let index = 0; index < outline.length; index++) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    if (!current || !next) continue;
    const [x, y] = current;
    const [nextX, nextY] = next;
    if (x === undefined || y === undefined || nextX === undefined || nextY === undefined) continue;
    ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function drawText(ctx: CanvasRenderingContext2D, object: TextObject): void {
  ctx.font = `500 ${object.fontSize}px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  object.text.split('\n').forEach((line, index) => {
    const y = object.position.y + index * object.fontSize * 1.3;
    // A narrow white halo keeps notes readable over both light and dark screenshots.
    ctx.strokeStyle = object.style.color.toLowerCase() === '#ffffff' ? '#282832' : '#ffffff';
    ctx.lineWidth = Math.max(3, object.fontSize / 7);
    ctx.strokeText(line, object.position.x, y);
    ctx.fillText(line, object.position.x, y);
  });
}

function roughOptions(style: ObjectStyle, seed: number) {
  return {
    seed,
    stroke: style.color,
    strokeWidth: style.width,
    roughness: 0.65,
    bowing: 0.2,
    preserveVertices: true,
    disableMultiStroke: false,
  };
}
