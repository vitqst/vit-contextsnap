import { drawLabelText } from './render-label';
import rough from 'roughjs';
import { getArrowLabelLayout } from '../core/arrow-label';
import { arrowHeadPoints } from '../core/geometry';
import { arrowControl } from '../core/arrows';
import { penOutline } from '../core/brush';
import { drawShapeNote, drawSticky } from './render-notes';
import { objectsInPaintOrder } from '../core/layers';
import { documentBounds } from '../core/document-bounds';
import { checkImageSize, MAX_IMAGE_PIXELS } from '../core/image-size';
import type {
  ArrowObject,
  DrawingObject,
  ObjectStyle,
  PenObject,
  Rect,
  StepObject,
  TextObject,
} from '../core/model';
import {
  drawExpandedBackground,
  drawMagnifier,
  drawRedaction,
  applyPrivacyEffects,
  sourceImageSize,
  type SceneRenderOptions,
} from './render-effects';
import type { ImageAssets } from './image-assets';
import { drawPreviewImage } from './preview-image';

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

interface CachedSurface {
  canvas: HTMLCanvasElement;
  bounds: Rect;
  objects: readonly DrawingObject[];
  privacy: readonly DrawingObject[];
  labelBounds?: Rect;
  assets?: ImageAssets;
  expandedBackground: boolean;
  previewEffects: boolean;
}

interface LensCache {
  entries: Map<string, CachedSurface>;
  pixels: number;
}

// Consecutive lenses share their non-lens underlay. Interleaved layers need distinct
// prefixes, bounded to eight surfaces / 32MP total per document, not one per lens.
const lensSources = new WeakMap<CanvasImageSource, LensCache>();
const protectedScenes = new WeakMap<CanvasImageSource, CachedSurface>();
// Blur geometry changes every drag frame, but the artwork beneath it usually does
// not. Keep one sanitized, unblurred underlay, capped at 32MB of additional pixels.
const blurUnderlays = new WeakMap<CanvasImageSource, CachedSurface>();
const MAX_BLUR_UNDERLAY_PIXELS = 8_000_000;

/** Draws only document content. Selection handles and editor overlays never enter this layer. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  sceneBounds?: Rect | null,
  assets?: ImageAssets,
  options: SceneRenderOptions = {},
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
  const size = sourceImageSize(image);
  const contentBounds = documentBounds(size.width, size.height, objects);
  checkImageSize(contentBounds.width, contentBounds.height);
  // Only an explicit crop constrains label placement. The viewport and lenses
  // must not move or rewrap unrelated labels while the user pans or drags.
  const bounds = sceneBounds ?? undefined;
  const ordered = objectsInPaintOrder(objects);
  const normal = ordered.filter((object) => object.type !== 'blur' && object.type !== 'redact');
  const privacy = ordered.filter((object) => object.type === 'blur' || object.type === 'redact');
  // Validate even on raster cache hits: a missing asset must never be silently omitted.
  for (const object of normal) {
    if (object.type === 'image' && !assets?.has(object.assetId))
      throw new Error('An inserted image is unavailable. Reopen the screenshot and add it again.');
  }
  if (!normal.some((object) => object.type === 'magnifier')) {
    const cached = lensSources.get(image);
    if (cached) {
      for (const surface of cached.entries.values()) releaseSurface(surface);
      lensSources.delete(image);
    }
  }
  if (privacy.length) {
    // Composite in world pixels before any viewport resampling. Reordering images
    // above drawings must not let them bypass blur or expose fractional mask edges.
    const surface = getProtectedScene(
      image,
      normal,
      privacy,
      bounds,
      contentBounds,
      assets,
      options,
    );
    ctx.drawImage(surface.canvas, surface.bounds.x, surface.bounds.y);
  } else {
    clearBlurUnderlay(image);
    const previous = protectedScenes.get(image);
    if (previous) {
      releaseSurface(previous);
      protectedScenes.delete(image);
    }
    const preview = options.expandedBackground === false;
    drawBackground(ctx, image, contentBounds, options, preview);
    drawOrderedObjects(ctx, image, normal, privacy, bounds, assets, options, preview);
  }
  ctx.restore();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  bounds: Rect,
  options: SceneRenderOptions,
  preview = false,
): void {
  const size = sourceImageSize(image);
  if (options.expandedBackground !== false) drawExpandedBackground(ctx, size, bounds);
  if (preview) drawPreviewImage(ctx, image, { x: 0, y: 0, ...size });
  else ctx.drawImage(image, 0, 0);
}

function drawOrderedObjects(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  bounds: Rect | undefined,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
  preview = false,
): void {
  const underlay: DrawingObject[] = [];
  for (const object of objects) {
    if (object.type === 'magnifier') {
      const surface = getLensSource(image, underlay, privacy, bounds, assets, options);
      drawMagnifier(ctx, surface.canvas, object, surface.bounds);
      if (object.note?.trim()) drawShapeNote(ctx, object, bounds);
    } else {
      drawNonLensObject(ctx, object, bounds, assets, preview);
      underlay.push(object);
    }
  }
}

function drawNonLensObject(
  ctx: CanvasRenderingContext2D,
  object: DrawingObject,
  bounds?: Rect,
  assets?: ImageAssets,
  preview = false,
): void {
  if (object.type === 'image') {
    const source = assets!.get(object.assetId)!.source;
    const { x, y, width, height } = object.rect;
    if (preview) drawPreviewImage(ctx, source, object.rect);
    else ctx.drawImage(source, x, y, width, height);
  } else if (object.type !== 'blur') drawObject(ctx, object, bounds);
  if (object.note?.trim()) drawShapeNote(ctx, object, bounds);
}

function getLensSource(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  labelBounds: Rect | undefined,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
): CachedSurface {
  const size = sourceImageSize(image);
  const bounds = documentBounds(size.width, size.height, [...objects, ...privacy]);
  const cache = lensSources.get(image) ?? { entries: new Map<string, CachedSurface>(), pixels: 0 };
  lensSources.set(image, cache);
  const key = objects.at(-1)?.id ?? '';
  const previous = cache.entries.get(key);
  if (
    previous &&
    matchesSurface(previous, objects, privacy, labelBounds, bounds, assets, options)
  ) {
    cache.entries.delete(key);
    cache.entries.set(key, previous);
    return previous;
  }
  if (previous) {
    cache.entries.delete(key);
    cache.pixels -= previous.bounds.width * previous.bounds.height;
  }
  const pixels = bounds.width * bounds.height;
  while (
    cache.entries.size &&
    (cache.entries.size >= 8 || cache.pixels + pixels > MAX_IMAGE_PIXELS)
  ) {
    const [oldKey, surface] = cache.entries.entries().next().value!;
    cache.entries.delete(oldKey);
    cache.pixels -= surface.bounds.width * surface.bounds.height;
    releaseSurface(surface);
  }
  // All lenses are absent from this prefix, so magnifiers never recursively sample one another.
  const surface = renderSurface(
    previous,
    objects,
    privacy,
    labelBounds,
    bounds,
    assets,
    options,
    (ctx) => {
      drawBackground(ctx, image, bounds, options);
      for (const object of objects) drawNonLensObject(ctx, object, labelBounds, assets);
    },
  );
  cache.entries.set(key, surface);
  cache.pixels += pixels;
  return surface;
}

function getProtectedScene(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  labelBounds: Rect | undefined,
  bounds: Rect,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
): CachedSurface {
  const previous = protectedScenes.get(image);
  if (previous && matchesSurface(previous, objects, privacy, labelBounds, bounds, assets, options))
    return previous;
  protectedScenes.delete(image);
  const underlay = getBlurUnderlay(image, objects, privacy, labelBounds, assets, options);
  const surface = renderSurface(
    previous,
    objects,
    privacy,
    labelBounds,
    bounds,
    assets,
    options,
    (ctx) => {
      if (underlay) {
        if (options.expandedBackground !== false)
          drawExpandedBackground(ctx, sourceImageSize(image), bounds);
        ctx.drawImage(underlay.canvas, underlay.bounds.x, underlay.bounds.y);
      } else {
        drawBackground(ctx, image, bounds, options);
        drawOrderedObjects(ctx, image, objects, privacy, labelBounds, assets, options);
      }
    },
  );
  protectedScenes.set(image, surface);
  return surface;
}

function clearBlurUnderlay(image: CanvasImageSource): void {
  const previous = blurUnderlays.get(image);
  if (previous) {
    releaseSurface(previous);
    blurUnderlays.delete(image);
  }
}

function getBlurUnderlay(
  image: CanvasImageSource,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  labelBounds: Rect | undefined,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
): CachedSurface | undefined {
  // A lens samples privacy effects in its prefix, so its pixels depend on blur
  // geometry too. Keep that path together rather than retaining a stale lens.
  if (
    !options.previewEffects ||
    !privacy.some((object) => object.type === 'blur') ||
    objects.some((object) => object.type === 'magnifier')
  ) {
    clearBlurUnderlay(image);
    return undefined;
  }
  const redactions = privacy.filter((object) => object.type === 'redact');
  const size = sourceImageSize(image);
  // Exclude blur bounds: dragging a blur beyond the screenshot must not resize
  // and rebuild unchanged artwork. Final compositing still uses all scene bounds.
  const bounds = documentBounds(size.width, size.height, [...objects, ...redactions]);
  if (bounds.width * bounds.height > MAX_BLUR_UNDERLAY_PIXELS) {
    clearBlurUnderlay(image);
    return undefined;
  }
  const previous = blurUnderlays.get(image);
  if (
    previous &&
    matchesSurface(previous, objects, redactions, labelBounds, bounds, assets, options)
  )
    return previous;
  blurUnderlays.delete(image);
  const surface = renderSurface(
    previous,
    objects,
    redactions,
    labelBounds,
    bounds,
    assets,
    options,
    (ctx) => {
      drawBackground(ctx, image, bounds, options);
      for (const object of objects) drawNonLensObject(ctx, object, labelBounds, assets);
    },
    false,
  );
  blurUnderlays.set(image, surface);
  return surface;
}

function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  return (
    a === b ||
    (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
  );
}

function matchesSurface(
  surface: CachedSurface,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  labelBounds: Rect | undefined,
  bounds: Rect,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
): boolean {
  // Documents and assets are immutable. Compare references rather than serializing
  // every pen point for every pointer-move/viewport frame.
  return (
    surface.assets === assets &&
    surface.expandedBackground === (options.expandedBackground !== false) &&
    surface.previewEffects === !!options.previewEffects &&
    sameRect(surface.bounds, bounds) &&
    sameRect(surface.labelBounds, labelBounds) &&
    surface.objects.length === objects.length &&
    surface.objects.every((object, index) => object === objects[index]) &&
    surface.privacy.length === privacy.length &&
    surface.privacy.every((object, index) => object === privacy[index])
  );
}

function releaseSurface(surface: CachedSurface): void {
  surface.canvas.width = surface.canvas.height = 1;
}

function renderSurface(
  previous: CachedSurface | undefined,
  objects: readonly DrawingObject[],
  privacy: readonly DrawingObject[],
  labelBounds: Rect | undefined,
  bounds: Rect,
  assets: ImageAssets | undefined,
  options: SceneRenderOptions,
  paint: (ctx: CanvasRenderingContext2D) => void,
  privacyNotes = true,
): CachedSurface {
  checkImageSize(bounds.width, bounds.height);
  const canvas = previous?.canvas ?? document.createElement('canvas');
  if (canvas.width !== bounds.width || canvas.height !== bounds.height) {
    canvas.width = canvas.height = 1;
    canvas.width = bounds.width;
    canvas.height = bounds.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The image effects renderer could not start. Try a smaller image.');
  ctx.resetTransform();
  ctx.clearRect(0, 0, bounds.width, bounds.height);
  ctx.translate(-bounds.x, -bounds.y);
  try {
    paint(ctx);
    if (privacy.length) {
      applyPrivacyEffects(ctx, canvas, privacy, bounds, options);
      // Underlays contain masks, not their labels. Notes are painted once, above
      // the final blur, so caching cannot introduce a blurred duplicate label.
      if (privacyNotes)
        for (const object of privacy)
          if (object.note?.trim()) drawShapeNote(ctx, object, labelBounds);
    }
  } catch (error) {
    // A failed filter cannot leave a cache containing partially sanitized pixels.
    canvas.width = canvas.height = 1;
    throw error;
  }
  return {
    canvas,
    bounds: { ...bounds },
    objects: [...objects],
    privacy: [...privacy],
    labelBounds: labelBounds && { ...labelBounds },
    assets,
    expandedBackground: options.expandedBackground !== false,
    previewEffects: !!options.previewEffects,
  };
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
    // Canvas shadows ignore the transform, unlike the path they belong to.
    // Keep their dimensions in document pixels for zoomed and HiDPI previews.
    const transform = ctx.getTransform();
    const rasterScale = Math.hypot(transform.a, transform.b);
    ctx.shadowColor = 'rgba(24, 24, 38, 0.24)';
    ctx.shadowBlur = 5 * rasterScale;
    ctx.shadowOffsetX = 2 * transform.c;
    ctx.shadowOffsetY = 2 * transform.d;
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
