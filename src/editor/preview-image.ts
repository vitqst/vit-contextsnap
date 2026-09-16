import type { Rect } from '../core/model';
import { sourceImageSize } from './render-effects';

interface PreviewRaster {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  key: string;
  variants: Map<string, PreviewRaster>;
}

const MAX_PREVIEW_PIXELS = 4_000_000;
const MAX_PREVIEW_IMAGES = 16;
// Weak keys do not retain decoded originals after a screenshot session closes.
const rasters = new WeakMap<CanvasImageSource, Map<string, PreviewRaster>>();
const recent = new Set<PreviewRaster>();
let retainedPixels = 0;

function release(raster: PreviewRaster): void {
  retainedPixels -= raster.width * raster.height;
  recent.delete(raster);
  raster.variants.delete(raster.key);
  raster.canvas.width = raster.canvas.height = 1;
}

/** Live display only. Sources must be immutable; export always draws original pixels. */
export function drawPreviewImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: Rect,
): void {
  const size = sourceImageSize(source);
  const transform = ctx.getTransform();
  const width = Math.max(1, Math.ceil(rect.width * Math.hypot(transform.a, transform.b)));
  const height = Math.max(1, Math.ceil(rect.height * Math.hypot(transform.c, transform.d)));
  if (
    !Number.isFinite(width * height) ||
    width >= size.width ||
    height >= size.height ||
    width * height > MAX_PREVIEW_PIXELS
  ) {
    // At 1:1 and above, never substitute previously downsampled pixels.
    ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
    return;
  }
  const variants = rasters.get(source) ?? new Map<string, PreviewRaster>();
  const key = `${width}x${height}`;
  let raster = variants.get(key);
  if (!raster) {
    while (
      recent.size >= MAX_PREVIEW_IMAGES ||
      retainedPixels + width * height > MAX_PREVIEW_PIXELS
    )
      release(recent.values().next().value!);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const paint = canvas.getContext('2d');
    if (!paint) {
      ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
      return;
    }
    downsample(paint, source, size, width, height);
    raster = { canvas, width, height, key, variants };
    variants.set(key, raster);
    rasters.set(source, variants);
    retainedPixels += width * height;
  }
  recent.delete(raster);
  recent.add(raster);
  ctx.drawImage(raster.canvas, rect.x, rect.y, rect.width, rect.height);
}

function downsample(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  size: { width: number; height: number },
  width: number,
  height: number,
): void {
  let current = source;
  let temporary: HTMLCanvasElement | null = null;
  let currentWidth = size.width;
  let currentHeight = size.height;
  try {
    // WebKit can alias fine detail on large single-step reductions even with
    // smoothingQuality=high. Halving first preserves that detail in the cache.
    while (currentWidth > width * 2 || currentHeight > height * 2) {
      const next = document.createElement('canvas');
      next.width = Math.max(width, Math.ceil(currentWidth / 2));
      next.height = Math.max(height, Math.ceil(currentHeight / 2));
      const paint = next.getContext('2d');
      if (!paint) break;
      paint.imageSmoothingEnabled = true;
      paint.imageSmoothingQuality = 'high';
      paint.drawImage(current, 0, 0, next.width, next.height);
      if (temporary) temporary.width = temporary.height = 1;
      temporary = next;
      current = next;
      currentWidth = next.width;
      currentHeight = next.height;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, width, height);
  } finally {
    if (temporary) temporary.width = temporary.height = 1;
  }
}
