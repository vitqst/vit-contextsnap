import type {
  BlurObject,
  DrawingObject,
  MagnifierObject,
  Point,
  Rect,
  RectangleObject,
} from '../core/model';

interface ImageSize {
  width: number;
  height: number;
}
interface CachedSource {
  canvas: HTMLCanvasElement;
  signature: string;
}

/** Captured/imported screenshots are immutable; only the current mask result is cached per image. */
const sanitizedSources = new WeakMap<CanvasImageSource, CachedSource>();

export function sourceImageSize(image: CanvasImageSource): ImageSize {
  if ('naturalWidth' in image) return { width: image.naturalWidth, height: image.naturalHeight };
  if ('videoWidth' in image) return { width: image.videoWidth, height: image.videoHeight };
  if ('displayWidth' in image) return { width: image.displayWidth, height: image.displayHeight };
  if (typeof image.width === 'number' && typeof image.height === 'number')
    return { width: image.width, height: image.height };
  if (typeof image.width === 'object' && typeof image.height === 'object')
    return { width: image.width.baseVal.value, height: image.height.baseVal.value };
  throw new Error('The source image has invalid dimensions.');
}

export function magnifierSourceRect(center: Point, radius: number, zoom: number): Rect {
  const scale = Number.isFinite(zoom) ? Math.max(1, Math.min(8, zoom)) : 2;
  const diameter = (Math.max(1, radius) * 2) / scale;
  return {
    x: center.x - diameter / 2,
    y: center.y - diameter / 2,
    width: diameter,
    height: diameter,
  };
}

export function blurSampleBounds(rect: Rect, strength: number, size: ImageSize): Rect {
  const padding = Math.ceil(blurStrength(strength) * 3);
  const x = Math.max(0, Math.min(size.width, Math.floor(rect.x) - padding));
  const y = Math.max(0, Math.min(size.height, Math.floor(rect.y) - padding));
  const right = Math.max(x, Math.min(size.width, Math.ceil(rect.x + rect.width) + padding));
  const bottom = Math.max(y, Math.min(size.height, Math.ceil(rect.y + rect.height) + padding));
  return { x, y, width: right - x, height: bottom - y };
}

function blurStrength(value: number): number {
  return Number.isFinite(value) ? Math.max(4, Math.min(32, value)) : 12;
}

export function drawRedaction(ctx: CanvasRenderingContext2D, rect: Rect): void {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#000000';
  // Cover all touched pixels so a fractional mask edge cannot reveal the original image.
  ctx.fillRect(x, y, Math.ceil(rect.x + rect.width) - x, Math.ceil(rect.y + rect.height) - y);
  ctx.restore();
}

/** The lens sees only this flattened screenshot layer, never raw masked source pixels. */
export function getEffectSource(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
): CanvasImageSource {
  const redactions = objects.filter(
    (object): object is RectangleObject => object.type === 'redact',
  );
  const blurs = objects.filter((object): object is BlurObject => object.type === 'blur');
  const hasLens = objects.some((object) => object.type === 'magnifier');
  if (!blurs.length && (!hasLens || !redactions.length)) {
    const previous = sanitizedSources.get(image);
    if (previous) {
      previous.canvas.width = 1;
      previous.canvas.height = 1;
      sanitizedSources.delete(image);
    }
    return image;
  }
  const size = sourceImageSize(image);
  const signature = JSON.stringify([
    size.width,
    size.height,
    redactions.map((object) => object.rect),
    blurs.map((object) => [object.rect, blurStrength(object.strength)]),
  ]);
  const previous = sanitizedSources.get(image);
  if (previous?.signature === signature) return previous.canvas;
  const canvas = previous?.canvas ?? document.createElement('canvas');
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The image effects renderer could not start. Try a smaller image.');
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.drawImage(image, 0, 0);
  // Remove secrets before ANY filter samples neighboring pixels.
  for (const object of redactions) drawRedaction(ctx, object.rect);
  for (const object of blurs) drawBlurPatch(ctx, canvas, object, size);
  // Filtering a black mask must not soften its original covered area.
  for (const object of redactions) drawRedaction(ctx, object.rect);
  sanitizedSources.set(image, { canvas, signature });
  return canvas;
}

function drawBlurPatch(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  object: BlurObject,
  size: ImageSize,
): void {
  const rect = object.rect;
  if (rect.width <= 0 || rect.height <= 0) return;
  const sample = blurSampleBounds(rect, object.strength, size);
  if (!sample.width || !sample.height) return;
  const patch = document.createElement('canvas');
  patch.width = sample.width;
  patch.height = sample.height;
  const patchContext = patch.getContext('2d');
  if (!patchContext) throw new Error('The blur renderer could not start. Try a smaller area.');
  patchContext.drawImage(
    source,
    sample.x,
    sample.y,
    sample.width,
    sample.height,
    0,
    0,
    sample.width,
    sample.height,
  );
  ctx.save();
  ctx.beginPath();
  const left = Math.floor(rect.x);
  const top = Math.floor(rect.y);
  ctx.rect(left, top, Math.ceil(rect.x + rect.width) - left, Math.ceil(rect.y + rect.height) - top);
  ctx.clip();
  // Gaussian blur can become translucent at image edges. Replace those pixels with white,
  // rather than blending the filtered result over any unblurred original detail.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(
    left,
    top,
    Math.ceil(rect.x + rect.width) - left,
    Math.ceil(rect.y + rect.height) - top,
  );
  ctx.filter = `blur(${blurStrength(object.strength)}px)`;
  ctx.drawImage(patch, sample.x, sample.y);
  ctx.restore();
  patch.width = 1;
  patch.height = 1;
}

export function drawMagnifier(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  lens: MagnifierObject,
): void {
  const { center } = lens;
  const radius = Math.max(1, lens.radius);
  const sample = magnifierSourceRect(center, radius, lens.zoom);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(24, 24, 38, 0.2)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    sample.x,
    sample.y,
    sample.width,
    sample.height,
    center.x - radius,
    center.y - radius,
    radius * 2,
    radius * 2,
  );
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, lens.style.width) + 4;
  ctx.stroke();
  ctx.strokeStyle = lens.style.color;
  ctx.lineWidth = Math.max(2, lens.style.width);
  ctx.stroke();
  ctx.restore();
}
