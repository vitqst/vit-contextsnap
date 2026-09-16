import type { Point, Rect, TextObject } from './model';
import { measureText } from './label-layout';
import { wrapEditableText } from './text-wrap';

export const DEFAULT_TEXT_WIDTH = 220;
export const MIN_TEXT_WIDTH = 40;
export const TEXT_CARD_PADDING = 12;
export const TEXT_CARD_RADIUS = 6;
export type TextHandle = 'w' | 'e';
export interface TextLayout {
  rect: Rect;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** Includes an indivisible glyph wider than its fixed wrapping box. */
  inkWidth: number;
  contentWidth?: number;
}

type TextMetrics = Omit<TextLayout, 'rect'> & { width: number; height: number };
const metricsCache = new Map<string, TextMetrics>();

export function getTextLayout(
  object: Pick<TextObject, 'position' | 'text' | 'fontSize' | 'width'>,
): TextLayout {
  const fontSize = Number.isFinite(object.fontSize) && object.fontSize > 0 ? object.fontSize : 24;
  const lineHeight = Math.ceil(fontSize * 1.3);
  const width =
    object.width !== undefined && Number.isFinite(object.width) && object.width > 0
      ? Math.max(MIN_TEXT_WIDTH, object.width)
      : undefined;
  // The application loads its annotation font before mounting the editor. Cache
  // text metrics independently of position, with a hard bound on retained text.
  const key = object.text.length <= 8192 ? JSON.stringify([fontSize, width, object.text]) : null;
  let metrics = key ? metricsCache.get(key) : undefined;
  if (!metrics) {
    const lines =
      width === undefined
        ? object.text.split(/\r\n|\r|\n/u)
        : wrapEditableText(object.text, width, Infinity, (value) => measureText(value, fontSize))
            .lines;
    let measured = 1;
    for (const line of lines) measured = Math.max(measured, measureText(line, fontSize));
    metrics = {
      width: width ?? measured,
      height: lines.length * lineHeight,
      inkWidth: measured,
      lines,
      fontSize,
      lineHeight,
    };
  }
  if (key) {
    metricsCache.delete(key);
    metricsCache.set(key, metrics);
    if (metricsCache.size > 64) metricsCache.delete(metricsCache.keys().next().value!);
  }
  return {
    rect: { ...object.position, width: metrics.width, height: metrics.height },
    lines: metrics.lines,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
    inkWidth: metrics.inkWidth,
    contentWidth: metrics.width,
  };
}

/** Background geometry never changes the text's original position or wrapping metrics. */
export function getTextCardRect(object: TextObject, layout?: TextLayout): Rect | null {
  if (!object.background?.enabled) return null;
  const text = layout ?? getTextLayout(object);
  return {
    x: text.rect.x - TEXT_CARD_PADDING,
    y: text.rect.y - TEXT_CARD_PADDING,
    width: Math.max(text.rect.width, text.inkWidth) + TEXT_CARD_PADDING * 2,
    height: text.rect.height + TEXT_CARD_PADDING * 2,
  };
}

export function textHandles(object: TextObject): Record<TextHandle, Point> {
  const layout = getTextLayout(object);
  const rect = getTextCardRect(object, layout) ?? layout.rect;
  const y = rect.y + rect.height / 2;
  return { w: { x: rect.x, y }, e: { x: rect.x + rect.width, y } };
}

export function hitTestTextHandle(
  object: TextObject,
  point: Point,
  tolerance: number,
): TextHandle | null {
  const handles = textHandles(object);
  const radius = Math.min(tolerance, (handles.e.x - handles.w.x) / 3);
  for (const handle of ['w', 'e'] as const) {
    const center = handles[handle];
    if (Math.hypot(point.x - center.x, point.y - center.y) <= radius) return handle;
  }
  return null;
}

export function resizeTextWidth(object: TextObject, handle: TextHandle, point: Point): TextObject {
  if (!Number.isFinite(point.x)) return object;
  const layout = getTextLayout(object);
  const card = getTextCardRect(object, layout);
  const rect = card ?? layout.rect;
  if (card && point.x === (handle === 'w' ? rect.x : rect.x + rect.width)) return object;
  const padding = card ? TEXT_CARD_PADDING : 0;
  const anchor = handle === 'w' ? rect.x + rect.width : rect.x;
  const width = Math.max(
    MIN_TEXT_WIDTH,
    (handle === 'w' ? anchor - point.x : point.x - anchor) - padding * 2,
  );
  // An indivisible glyph may remain wider than the requested wrapping width.
  // Measure that resulting extent before positioning the left edge, keeping
  // the opposite visible card edge fixed even when the card cannot get narrower.
  const visibleWidth =
    card && handle === 'w' ? Math.max(width, getTextLayout({ ...object, width }).inkWidth) : width;
  const x = handle === 'w' ? anchor - visibleWidth - padding : anchor + padding;
  if (width === object.width && x === object.position.x) return object;
  return { ...object, position: { x, y: object.position.y }, width };
}
