import type {
  BlurObject,
  DrawingObject,
  MagnifierObject,
  Point,
  Rect,
  RectangleObject,
} from '../core/model';
import type { ImageAssets } from './image-assets';
import { blurPixels } from './blur';
import { documentBounds } from '../core/document-bounds';
import { checkImageSize } from '../core/image-size';

interface ImageSize {
  width: number;
  height: number;
}
export interface SceneRenderOptions {
  /** Expanded PNGs have a white background; the live workspace remains transparent. */
  expandedBackground?: boolean;
  /** Opt-in interactive CPU blur approximation; export keeps source-resolution pixels. */
  previewEffects?: boolean;
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

/** New canvas area is white, but transparent pixels within the original remain untouched. */
export function drawExpandedBackground(
  ctx: CanvasRenderingContext2D,
  size: ImageSize,
  bounds: Rect,
): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  if (bounds.y < 0) ctx.fillRect(bounds.x, bounds.y, bounds.width, -bounds.y);
  const bottom = bounds.y + bounds.height;
  if (bottom > size.height) ctx.fillRect(bounds.x, size.height, bounds.width, bottom - size.height);
  if (bounds.x < 0) ctx.fillRect(bounds.x, 0, -bounds.x, size.height);
  const right = bounds.x + bounds.width;
  if (right > size.width) ctx.fillRect(size.width, 0, right - size.width, size.height);
  ctx.restore();
}

/** Ordinary annotations and lenses cannot change the screenshot-effects raster extent. */
export function effectSourceBounds(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
): Rect {
  const size = sourceImageSize(image);
  return documentBounds(
    size.width,
    size.height,
    objects.filter(
      (object) => object.type === 'image' || object.type === 'blur' || object.type === 'redact',
    ),
  );
}

/** The lens sees only this flattened screenshot layer, never raw masked source pixels. */
export function getEffectSource(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  assets?: ImageAssets,
  sceneBounds?: Rect,
  options: SceneRenderOptions = {},
): CanvasImageSource {
  const images = objects.filter((object) => object.type === 'image');
  // Validate even on cache hits: export must never silently omit an unavailable asset.
  for (const object of images)
    if (!assets?.has(object.assetId))
      throw new Error('An inserted image is unavailable. Reopen the screenshot and add it again.');
  const redactions = objects.filter(
    (object): object is RectangleObject => object.type === 'redact',
  );
  const blurs = objects.filter((object): object is BlurObject => object.type === 'blur');
  if (!images.length && !blurs.length && !redactions.length) {
    const previous = sanitizedSources.get(image);
    if (previous) {
      previous.canvas.width = 1;
      previous.canvas.height = 1;
      sanitizedSources.delete(image);
    }
    return image;
  }
  const size = sourceImageSize(image);
  const bounds = sceneBounds ?? effectSourceBounds(image, objects);
  const expandedBackground = options.expandedBackground !== false;
  checkImageSize(bounds.width, bounds.height);
  const signature = JSON.stringify([
    bounds,
    expandedBackground,
    options.previewEffects === true,
    images.map((object) => [object.assetId, object.rect]),
    redactions.map((object) => object.rect),
    blurs.map((object) => [object.rect, blurStrength(object.strength)]),
  ]);
  const previous = sanitizedSources.get(image);
  if (previous?.signature === signature) return previous.canvas;
  // Reusing the canvas overwrites its pixels. A failed filter must not leave the old
  // signature pointing at a partially rendered (potentially unblurred) screenshot.
  sanitizedSources.delete(image);
  const canvas = previous?.canvas ?? document.createElement('canvas');
  if (canvas.width !== bounds.width || canvas.height !== bounds.height) {
    // Drop old backing pixels before changing aspect ratio: width-first could
    // transiently allocate oldHeight * newWidth far beyond the validated limit.
    canvas.width = canvas.height = 1;
    canvas.width = bounds.width;
    canvas.height = bounds.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The image effects renderer could not start. Try a smaller image.');
  ctx.resetTransform();
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.translate(-bounds.x, -bounds.y);
  if (expandedBackground) drawExpandedBackground(ctx, size, bounds);
  ctx.drawImage(image, 0, 0);
  for (const object of images) {
    const asset = assets!.get(object.assetId)!;
    const { x, y, width, height } = object.rect;
    ctx.drawImage(asset.source, x, y, width, height);
  }
  applyPrivacyEffects(ctx, canvas, objects, bounds, options);
  sanitizedSources.set(image, { canvas, signature });
  return canvas;
}

/** Sanitize full-resolution pixels before blur, magnification, or viewport resampling. */
export function applyPrivacyEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  objects: readonly DrawingObject[],
  bounds: Rect,
  options: SceneRenderOptions = {},
): void {
  const redactions = objects.filter(
    (object): object is RectangleObject => object.type === 'redact',
  );
  const blurs = objects.filter((object) => object.type === 'blur');
  // Remove secrets before ANY filter samples neighboring pixels.
  for (const object of redactions) drawRedaction(ctx, object.rect);
  ctx.save();
  ctx.resetTransform();
  for (const object of blurs)
    drawBlurPatch(
      ctx,
      canvas,
      {
        ...object,
        rect: { ...object.rect, x: object.rect.x - bounds.x, y: object.rect.y - bounds.y },
      },
      bounds,
      options,
    );
  ctx.restore();
  // Filtering a black mask must not soften its original covered area.
  for (const object of redactions) drawRedaction(ctx, object.rect);
}

function drawBlurPatch(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  object: BlurObject,
  size: ImageSize,
  options: SceneRenderOptions,
): void {
  const rect = object.rect;
  if (rect.width <= 0 || rect.height <= 0) return;
  const sample = blurSampleBounds(rect, object.strength, size);
  if (!sample.width || !sample.height) return;
  const patch = document.createElement('canvas');
  // Probe a tiny fresh context, not the destination where assigning .filter may
  // already have created an inert own property in a filter-less WebView.
  patch.width = patch.height = 1;
  const patchContext = patch.getContext('2d');
  if (!patchContext) throw new Error('The blur renderer could not start. Try a smaller area.');
  const nativeFilter = Reflect.has(patchContext, 'filter');
  const strength = blurStrength(object.strength);
  // Keep a 2–4px working radius, with at most 8x reduction per axis. The source
  // was redacted before reaching here: no hidden pixels enter any downsampling.
  const reduction =
    !nativeFilter && options.previewEffects === true
      ? Math.min(8, 2 ** Math.floor(Math.log2(strength / 2)))
      : 1;
  patch.width = Math.max(1, Math.ceil(sample.width / reduction));
  patch.height = Math.max(1, Math.ceil(sample.height / reduction));
  drawBlurSample(source, sample, patchContext, patch.width, patch.height);
  if (!nativeFilter) {
    const pixels = patchContext.getImageData(0, 0, patch.width, patch.height);
    pixels.data.set(
      blurPixels(pixels, reduction === 1 ? Math.floor(strength) : Math.round(strength / reduction)),
    );
    patchContext.putImageData(pixels, 0, 0);
  }
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
  ctx.filter = nativeFilter ? `blur(${strength}px)` : 'none';
  if (reduction === 1) ctx.drawImage(patch, sample.x, sample.y);
  else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      patch,
      0,
      0,
      patch.width,
      patch.height,
      sample.x,
      sample.y,
      sample.width,
      sample.height,
    );
  }
  ctx.restore();
  patch.width = 1;
  patch.height = 1;
}

/** Progressive 2x reduction avoids WebKit aliasing on fine screenshot text/stripes. */
function drawBlurSample(
  source: HTMLCanvasElement,
  sample: Rect,
  destination: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  let current = source;
  let area = sample;
  let temporary: HTMLCanvasElement | null = null;
  try {
    while (area.width > width * 2 || area.height > height * 2) {
      const next = document.createElement('canvas');
      next.width = Math.max(width, Math.ceil(area.width / 2));
      next.height = Math.max(height, Math.ceil(area.height / 2));
      const ctx = next.getContext('2d');
      if (!ctx) throw new Error('The blur renderer could not start. Try a smaller area.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        current,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        next.width,
        next.height,
      );
      if (temporary) temporary.width = temporary.height = 1;
      current = next;
      temporary = next;
      area = { x: 0, y: 0, width: next.width, height: next.height };
    }
    destination.imageSmoothingEnabled = true;
    destination.imageSmoothingQuality = 'high';
    destination.drawImage(current, area.x, area.y, area.width, area.height, 0, 0, width, height);
  } finally {
    if (temporary) temporary.width = temporary.height = 1;
  }
}

export function drawMagnifier(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  lens: MagnifierObject,
  sourceOrigin: Point = { x: 0, y: 0 },
): void {
  const { center } = lens;
  const radius = Math.max(1, lens.radius);
  const sample = magnifierSourceRect(center, radius, lens.zoom);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'transparent';
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
    sample.x - sourceOrigin.x,
    sample.y - sourceOrigin.y,
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
