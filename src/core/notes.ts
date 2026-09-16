import {
  getTextLabelLayout,
  labelFontSize,
  measureText,
  wrapText,
  LABEL_FONT_FAMILY,
} from './label-layout';
import type { ImageHandle } from './image-geometry';
import { wrapEditableText } from './text-wrap';
import {
  newObjectBase,
  type DrawingObject,
  type ObjectStyle,
  type Point,
  type Rect,
  type StepObject,
  type StickyObject,
} from './model';

export const NOTE_FONT_FAMILY = LABEL_FONT_FAMILY;

/** Inline editing and the flattened card must use the same readable foreground. */
export function stickyTextColor(color: string): string {
  let hex = color.replace('#', '');
  if (hex.length === 3)
    hex = Array.from(hex)
      .map((character) => character.repeat(2))
      .join('');
  if (!/^[\da-f]{6}$/iu.test(hex)) return '#252432';
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.62 ? '#252432' : '#ffffff';
}

export interface NoteLayout {
  rect: Rect;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  center: Point;
  truncated: boolean;
  /** Actual line-wrapping width, which may exceed a short label's tight bounds. */
  contentWidth: number;
}

export function objectText(object: DrawingObject): string {
  if (object.type === 'arrow') return object.label;
  if (object.type === 'text' || object.type === 'sticky') return object.text;
  return object.note ?? '';
}

export function withObjectText(object: DrawingObject, value: string): DrawingObject {
  if (object.type === 'arrow') return { ...object, label: value };
  if (object.type === 'text' || object.type === 'sticky') return { ...object, text: value };
  return { ...object, note: value };
}

/** Layout is shared by inline editing and flattened export; truncation never changes stored text. */
export function getNoteLayout(object: DrawingObject, bounds?: Rect): NoteLayout {
  if (object.type !== 'sticky') return shapeLabelLayout(object, bounds);
  const owner = noteBounds(object);
  const visible = bounds ? intersection(owner, bounds) : owner;
  const padding = object.type === 'sticky' ? 14 : 8;
  const width = Math.max(0, visible.width - padding * 2);
  const height = Math.max(0, visible.height - padding * 2);
  const preferredSize = boundedFontSize(object.fontSize);
  const center = { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 };
  const rect = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  const fitted = fitStickyText(objectText(object), width, height, preferredSize);
  return { rect, center, contentWidth: width, ...fitted };
}

type FittedStickyText = Pick<NoteLayout, 'fontSize' | 'lineHeight' | 'lines' | 'truncated'>;
const stickyTextCache = new Map<string, FittedStickyText>();
const stickyGraphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function fitStickyText(
  text: string,
  width: number,
  height: number,
  preferredSize: number,
): FittedStickyText {
  const key = text.length <= 8192 ? JSON.stringify([text, width, height, preferredSize]) : null;
  const cached = key ? stickyTextCache.get(key) : undefined;
  if (cached && key) {
    stickyTextCache.delete(key);
    stickyTextCache.set(key, cached);
    return cached;
  }
  const remember = (value: FittedStickyText) => {
    if (key) {
      stickyTextCache.set(key, value);
      if (stickyTextCache.size > 64) stickyTextCache.delete(stickyTextCache.keys().next().value!);
    }
    return value;
  };
  const layoutAt = (fontSize: number) => {
    const lineHeight = Math.ceil(fontSize * 1.3);
    const maxLines = Math.floor(height / lineHeight);
    const measure = (value: string) => measureText(value, fontSize);
    const wrapped =
      maxLines > 0 && measure('…') <= width
        ? wrapEditableText(text, width, maxLines, measure)
        : { lines: [], truncated: text.length > 0 };
    const oversized = wrapped.lines.findIndex((line) => measure(line) > width);
    if (oversized !== -1) {
      wrapped.lines = wrapped.lines.slice(0, oversized + 1);
      wrapped.truncated = true;
    }
    if (wrapped.truncated && wrapped.lines.length) {
      const last = wrapped.lines.length - 1;
      const characters = Array.from(
        stickyGraphemes.segment(wrapped.lines[last]!),
        (part) => part.segment,
      );
      while (characters.length && measure(`${characters.join('')}…`) > width) characters.pop();
      wrapped.lines[last] = `${characters.join('')}…`;
    }
    return { fontSize, lineHeight, ...wrapped };
  };
  const preferred = layoutAt(preferredSize);
  if (!preferred.truncated) return remember(preferred);
  // Search a bounded range, not one layout per font pixel or per typed character.
  // Keep the user's preferred size stored, so deleting text restores readability.
  let lower = 8;
  let upper = Math.floor(preferredSize);
  let fitted = layoutAt(lower);
  if (fitted.truncated) return remember(fitted);
  while (lower < upper) {
    const size = Math.ceil((lower + upper) / 2);
    const candidate = layoutAt(size);
    if (candidate.truncated) upper = size - 1;
    else {
      lower = size;
      fitted = candidate;
    }
  }
  return remember(fitted);
}

/** Shape labels use the same typography and wrapping as arrow labels. */
function shapeLabelLayout(object: DrawingObject, bounds?: Rect): NoteLayout {
  const owner = noteBounds(object);
  const position = object.labelPosition ?? (object.type === 'rectangle' ? 'top' : 'inside');
  if (object.type === 'step' && object.labelPosition !== 'inside')
    return stepNoteLayout(object, bounds);
  return getTextLabelLayout(
    objectText(object),
    object.labelFontSize,
    ({ height }) => ({
      x: owner.x + owner.width / 2 + (position === 'free' ? (object.labelOffset?.x ?? 0) : 0),
      y:
        position === 'top'
          ? owner.y - 8 - height / 2
          : position === 'bottom'
            ? owner.y + owner.height + 8 + height / 2
            : owner.y + owner.height / 2 + (position === 'free' ? (object.labelOffset?.y ?? 0) : 0),
    }),
    bounds,
  );
}

export function hitTestShapeLabel(object: DrawingObject, point: Point, bounds?: Rect): boolean {
  if (['arrow', 'text', 'sticky'].includes(object.type) || !object.note?.trim()) return false;
  const { rect, lines } = getNoteLayout(object, bounds);
  return (
    lines.length > 0 &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function moveShapeLabelBy<T extends DrawingObject>(
  object: T,
  delta: Point,
  bounds?: Rect,
): T {
  if (!delta.x && !delta.y) return object;
  const before = getNoteLayout(object, bounds);
  const owner = noteBounds(object);
  return {
    ...object,
    labelPosition: 'free',
    labelOffset: {
      x: before.center.x + delta.x - owner.x - owner.width / 2,
      y: before.center.y + delta.y - owner.y - owner.height / 2,
    },
  };
}

export function withLabelPosition<T extends DrawingObject>(
  object: T,
  position: NonNullable<DrawingObject['labelPosition']>,
  bounds?: Rect,
): T {
  if (position !== 'free')
    return { ...object, labelPosition: position, labelOffset: { x: 0, y: 0 } };
  const before = getNoteLayout(object, bounds);
  const owner = noteBounds(object);
  return {
    ...object,
    labelPosition: position,
    labelOffset: {
      x: before.center.x - owner.x - owner.width / 2,
      y: before.center.y - owner.y - owner.height / 2,
    },
  };
}

/** Prefer below the numeral, or use clear space above; never clamp visible text onto its circle. */
function stepNoteLayout(object: StepObject, bounds?: Rect): NoteLayout {
  const fontSize = labelFontSize(object.labelFontSize);
  const lineHeight = Math.ceil(fontSize * 1.3);
  const width = Math.min(200, Math.max(0, bounds?.width ?? 200));
  const maximumHeight = Math.min(100, Math.max(0, bounds?.height ?? 100));
  const text = objectText(object);
  const measure = (value: string) => measureText(value, fontSize);
  const wrapWithinHeight = (height: number) => {
    const maxLines = Math.floor(height / lineHeight);
    return maxLines > 0 && measure('…') <= width
      ? wrapText(text, width, maxLines, measure)
      : { lines: [], truncated: text.length > 0 };
  };
  const preferred = wrapWithinHeight(maximumHeight);
  const preferredHeight = Math.min(maximumHeight, Math.max(1, preferred.lines.length) * lineHeight);
  const top = bounds?.y ?? -Infinity;
  const bottom = bounds ? bounds.y + bounds.height : Infinity;
  const belowStart = Math.max(top, object.center.y + object.radius + 8);
  const aboveEnd = Math.min(bottom, object.center.y - object.radius - 8);
  const belowSpace = Math.min(maximumHeight, Math.max(0, bottom - belowStart));
  const aboveSpace = Math.min(maximumHeight, Math.max(0, aboveEnd - top));
  const below =
    object.labelPosition === 'top'
      ? false
      : object.labelPosition === 'bottom'
        ? true
        : belowSpace >= preferredHeight ||
          (aboveSpace < preferredHeight && belowSpace >= aboveSpace);
  const free = object.labelPosition === 'free';
  const availableHeight = free ? maximumHeight : below ? belowSpace : aboveSpace;
  const wrapped =
    availableHeight >= preferredHeight ? preferred : wrapWithinHeight(availableHeight);
  // An empty note still offers a full line for the inline editor.
  const height = Math.min(availableHeight, Math.max(1, wrapped.lines.length) * lineHeight);
  let x = object.center.x - width / 2 + (free ? (object.labelOffset?.x ?? 0) : 0);
  let y = free
    ? object.center.y + (object.labelOffset?.y ?? 0) - height / 2
    : below
      ? belowStart
      : aboveEnd - height;
  if (bounds) {
    x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
    // Nonempty lines already fit their clear side; this only bounds empty/offscreen editor anchors.
    y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  }
  return {
    rect: { x, y, width, height },
    contentWidth: width,
    center: { x: x + width / 2, y: y + height / 2 },
    fontSize,
    lineHeight,
    ...wrapped,
  };
}

export function createSticky(point: Point, style: ObjectStyle, bounds: Rect): StickyObject {
  const width = Math.min(220, Math.max(0, bounds.width));
  const height = Math.min(150, Math.max(0, bounds.height));
  return {
    ...newObjectBase({ ...style, color: style.color || '#ffe58f', shadow: style.shadow ?? true }),
    type: 'sticky',
    rect: {
      x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, point.x - width / 2)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, point.y - height / 2)),
      width,
      height,
    },
    text: '',
    fontSize: 24,
  };
}

/** Free-aspect corners keep their opposite anchor; only card text scales with resizing. */
export function resizeSticky(
  object: StickyObject,
  handle: ImageHandle,
  point: Point,
): StickyObject {
  const directionX = handle === 'nw' || handle === 'sw' ? -1 : 1;
  const directionY = handle === 'nw' || handle === 'ne' ? -1 : 1;
  const anchor = {
    x: object.rect.x + (directionX < 0 ? object.rect.width : 0),
    y: object.rect.y + (directionY < 0 ? object.rect.height : 0),
  };
  const width = Math.max(80, (point.x - anchor.x) * directionX);
  const height = Math.max(60, (point.y - anchor.y) * directionY);
  const scale = Math.min(
    width / Math.max(1, object.rect.width),
    height / Math.max(1, object.rect.height),
  );
  return {
    ...object,
    rect: {
      x: directionX < 0 ? anchor.x - width : anchor.x,
      y: directionY < 0 ? anchor.y - height : anchor.y,
      width,
      height,
    },
    fontSize: boundedFontSize(boundedFontSize(object.fontSize) * scale),
  };
}

function boundedFontSize(size: number): number {
  return Number.isFinite(size) ? Math.max(12, Math.min(64, size)) : 24;
}

/** Deliberately independent of geometry.ts, which includes note bounds for hit testing. */
function noteBounds(object: DrawingObject): Rect {
  switch (object.type) {
    case 'sticky':
    case 'rectangle':
    case 'redact':
    case 'blur':
    case 'image':
      return object.rect;
    case 'step':
    case 'magnifier':
      return {
        x: object.center.x - object.radius,
        y: object.center.y - object.radius,
        width: object.radius * 2,
        height: object.radius * 2,
      };
    case 'pen': {
      if (!object.points.length) return { x: 0, y: 0, width: 0, height: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of object.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      const width = Math.max(80, maxX - minX);
      const height = Math.max(52, maxY - minY);
      return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
    }
    case 'text': {
      const lines = object.text.split(/\r?\n/u);
      return {
        ...object.position,
        width: Math.max(80, ...lines.map((line) => measureText(line, object.fontSize))),
        height: Math.max(52, lines.length * object.fontSize * 1.3),
      };
    }
    case 'arrow': {
      const x = Math.min(object.start.x, object.control.x, object.end.x);
      const y = Math.min(object.start.y, object.control.y, object.end.y);
      return {
        x,
        y,
        width: Math.max(80, Math.max(object.start.x, object.control.x, object.end.x) - x),
        height: Math.max(52, Math.max(object.start.y, object.control.y, object.end.y) - y),
      };
    }
  }
}

function intersection(rect: Rect, bounds: Rect): Rect {
  const x = Math.max(bounds.x, Math.min(bounds.x + bounds.width, rect.x));
  const y = Math.max(bounds.y, Math.min(bounds.y + bounds.height, rect.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.x + rect.width, bounds.x + bounds.width) - x),
    height: Math.max(0, Math.min(rect.y + rect.height, bounds.y + bounds.height) - y),
  };
}
