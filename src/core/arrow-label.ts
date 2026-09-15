import type { ArrowObject, Point, Rect } from './model';
import { arrowControl } from './arrows';

export const ARROW_LABEL_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MAX_WIDTH = 320;
const MAX_LINES = 8;
const PADDING_X = 10;
const PADDING_Y = 6;

export interface ArrowLabelLayout {
  rect: Rect;
  center: Point;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  truncated: boolean;
}

let measuringContext: CanvasRenderingContext2D | null | undefined;

export function arrowLabelFontSize(arrow: ArrowObject): number {
  const size = arrow.labelFontSize ?? 20;
  return Number.isFinite(size) ? Math.max(12, Math.min(48, size)) : 20;
}

/** One measured layout is shared by selection, pointer hit testing, preview, and PNG export. */
export function getArrowLabelLayout(arrow: ArrowObject, bounds?: Rect): ArrowLabelLayout {
  const fontSize = arrowLabelFontSize(arrow);
  const lineHeight = Math.ceil(fontSize * 1.3);
  const maxWidth = Math.min(MAX_WIDTH, Math.max(0, bounds?.width ?? MAX_WIDTH));
  const maxHeight = Math.max(0, bounds?.height ?? MAX_LINES * lineHeight + PADDING_Y * 2);
  const maxLines = Math.min(
    MAX_LINES,
    Math.max(0, Math.floor((maxHeight - PADDING_Y * 2) / lineHeight)),
  );
  const measure = (text: string) => measureText(text, fontSize);
  const contentWidth = Math.max(0, maxWidth - PADDING_X * 2);
  const text = arrow.label.trim();
  const wrapped =
    maxLines > 0 && measure('…') <= contentWidth
      ? wrapText(text, contentWidth, maxLines, measure)
      : { lines: [], truncated: text.length > 0 };
  const width = Math.min(maxWidth, Math.max(0, ...wrapped.lines.map(measure)) + PADDING_X * 2);
  const height = Math.min(maxHeight, wrapped.lines.length * lineHeight + PADDING_Y * 2);
  const control = arrowControl(arrow);
  const anchor = {
    x: arrow.start.x * 0.25 + control.x * 0.5 + arrow.end.x * 0.25,
    y: arrow.start.y * 0.25 + control.y * 0.5 + arrow.end.y * 0.25,
  };
  let x = anchor.x - width / 2;
  let y = anchor.y - height / 2;
  if (bounds) {
    x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
    y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  }
  const rect = { x, y, width, height };
  return {
    rect,
    center: { x: x + width / 2, y: y + height / 2 },
    ...wrapped,
    fontSize,
    lineHeight,
  };
}

export function hitTestArrowLabel(arrow: ArrowObject, point: Point, bounds?: Rect): boolean {
  if (!arrow.label.trim()) return false;
  const { rect } = getArrowLabelLayout(arrow, bounds);
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** An attached label is a grip for its whole arrow, even when crop-clamped. */
export function moveArrowLabelBy(arrow: ArrowObject, delta: Point, _bounds?: Rect): ArrowObject {
  const translate = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  return {
    ...arrow,
    start: translate(arrow.start),
    end: translate(arrow.end),
    control: translate(arrow.control),
  };
}

function measureText(text: string, fontSize: number): number {
  if (measuringContext === undefined && typeof document !== 'undefined') {
    measuringContext = document.createElement('canvas').getContext('2d');
  }
  if (measuringContext) {
    measuringContext.font = `500 ${fontSize}px ${ARROW_LABEL_FONT_FAMILY}`;
    return measuringContext.measureText(text).width;
  }
  // Pure geometry also runs without a browser. This conservative proportional estimate
  // keeps unit tests independent of OS fonts; browsers always measure the actual font.
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
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      for (const character of Array.from(word)) {
        if (measure(line + character) > width) {
          if (!line) {
            // A single wide glyph cannot fit: keep an honest ellipsis, never overflow.
            line = '…';
            forcedTruncation = true;
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
