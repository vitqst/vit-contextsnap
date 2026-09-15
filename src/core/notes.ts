import type { ImageHandle } from './image-geometry';
import {
  newObjectBase,
  type DrawingObject,
  type ObjectStyle,
  type Point,
  type Rect,
  type StepObject,
  type StickyObject,
} from './model';

export const NOTE_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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
  if (object.type === 'step') return stepNoteLayout(object, bounds);
  const owner = noteBounds(object);
  const visible = bounds ? intersection(owner, bounds) : owner;
  const padding = object.type === 'sticky' ? 14 : 8;
  const width = Math.max(0, visible.width - padding * 2);
  const height = Math.max(0, visible.height - padding * 2);
  const fontSize = object.type === 'sticky' ? boundedFontSize(object.fontSize) : 20;
  const lineHeight = Math.ceil(fontSize * 1.3);
  const center = { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 };
  const rect = { x: center.x - width / 2, y: center.y - height / 2, width, height };
  const maxLines = Math.floor(height / lineHeight);
  const text = objectText(object).trim();
  const measure = (value: string) => measureText(value, fontSize);
  const wrapped =
    maxLines > 0 && measure('…') <= width
      ? wrapText(text, width, maxLines, measure)
      : { lines: [], truncated: text.length > 0 };
  return { rect, center, fontSize, lineHeight, ...wrapped };
}

/** Prefer below the numeral, or use clear space above; never clamp visible text onto its circle. */
function stepNoteLayout(object: StepObject, bounds?: Rect): NoteLayout {
  const fontSize = 20;
  const lineHeight = 26;
  const width = Math.min(200, Math.max(0, bounds?.width ?? 200));
  const maximumHeight = Math.min(100, Math.max(0, bounds?.height ?? 100));
  const text = objectText(object).trim();
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
    belowSpace >= preferredHeight || (aboveSpace < preferredHeight && belowSpace >= aboveSpace);
  const availableHeight = below ? belowSpace : aboveSpace;
  const wrapped =
    availableHeight >= preferredHeight ? preferred : wrapWithinHeight(availableHeight);
  // An empty note still offers a full line for the inline editor.
  const height = Math.min(availableHeight, Math.max(1, wrapped.lines.length) * lineHeight);
  let x = object.center.x - width / 2;
  let y = below ? belowStart : aboveEnd - height;
  if (bounds) {
    x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
    // Nonempty lines already fit their clear side; this only bounds empty/offscreen editor anchors.
    y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  }
  return {
    rect: { x, y, width, height },
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

let measuringContext: CanvasRenderingContext2D | null | undefined;

function measureText(text: string, fontSize: number): number {
  if (measuringContext === undefined && typeof document !== 'undefined') {
    measuringContext = document.createElement('canvas').getContext('2d');
  }
  if (measuringContext) {
    measuringContext.font = `500 ${fontSize}px ${NOTE_FONT_FAMILY}`;
    return measuringContext.measureText(text).width;
  }
  // Unit-test geometry uses a conservative estimate; real preview/export measure the same font.
  return Array.from(text).reduce(
    (width, character) =>
      width +
      fontSize *
        (/\s/u.test(character)
          ? 0.33
          : /[ilI.,'!:;|]/u.test(character)
            ? 0.3
            : /[MW@#%]/u.test(character)
              ? 0.9
              : (character.codePointAt(0) ?? 0) > 0x024f
                ? 1
                : 0.6),
    0,
  );
}

function wrapText(
  text: string,
  width: number,
  maxLines: number,
  measure: (text: string) => number,
): { lines: string[]; truncated: boolean } {
  if (!text) return { lines: [], truncated: false };
  const lines: string[] = [];
  let forcedTruncation = false;
  outer: for (const paragraph of text.split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
        if (lines.length > maxLines) break outer;
      }
      for (const character of Array.from(word)) {
        if (measure(line + character) > width) {
          if (!line) {
            forcedTruncation = true;
            line = '…';
            break;
          }
          lines.push(line);
          line = '';
          if (lines.length > maxLines) break outer;
        }
        line += character;
      }
    }
    lines.push(line);
    if (lines.length > maxLines) break;
  }
  const truncated = forcedTruncation || lines.length > maxLines;
  const visible = lines.slice(0, maxLines);
  if (truncated && visible.length) {
    const index = visible.length - 1;
    const characters = Array.from(visible[index] ?? '');
    while (characters.length && measure(`${characters.join('')}…`) > width) characters.pop();
    visible[index] = `${characters.join('').trimEnd()}…`;
  }
  return { lines: visible, truncated };
}
