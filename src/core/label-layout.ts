import type { Point, Rect } from './model';

export const LABEL_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const MAX_WIDTH = 320;
const MAX_LINES = 8;
const PADDING_X = 10;
const PADDING_Y = 6;

export interface LabelLayout {
  rect: Rect;
  center: Point;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  truncated: boolean;
}

let measuringContext: CanvasRenderingContext2D | null | undefined;

export function labelFontSize(size = 20): number {
  return Number.isFinite(size) ? Math.max(12, Math.min(48, size)) : 20;
}

/** Shared measurement for hit testing, preview and export. Padding is an invisible hit target. */
export function getTextLabelLayout(
  text: string,
  size: number | undefined,
  anchorForSize: (size: { width: number; height: number }) => Point,
  bounds?: Rect,
): LabelLayout {
  const fontSize = labelFontSize(size);
  const lineHeight = Math.ceil(fontSize * 1.3);
  const maxWidth = Math.min(MAX_WIDTH, Math.max(0, bounds?.width ?? MAX_WIDTH));
  const maxHeight = Math.max(0, bounds?.height ?? MAX_LINES * lineHeight + PADDING_Y * 2);
  const maxLines = Math.min(
    MAX_LINES,
    Math.max(0, Math.floor((maxHeight - PADDING_Y * 2) / lineHeight)),
  );
  const measure = (text: string) => measureText(text, fontSize);
  const contentWidth = Math.max(0, maxWidth - PADDING_X * 2);
  text = text.trim();
  const wrapped =
    maxLines > 0 && measure('…') <= contentWidth
      ? wrapText(text, contentWidth, maxLines, measure)
      : { lines: [], truncated: text.length > 0 };
  const width = Math.min(maxWidth, Math.max(0, ...wrapped.lines.map(measure)) + PADDING_X * 2);
  const height = Math.min(maxHeight, wrapped.lines.length * lineHeight + PADDING_Y * 2);
  const anchor = anchorForSize({ width, height });
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

export function measureText(text: string, fontSize: number): number {
  if (measuringContext === undefined && typeof document !== 'undefined') {
    measuringContext = document.createElement('canvas').getContext('2d');
  }
  if (measuringContext) {
    measuringContext.font = `500 ${fontSize}px ${LABEL_FONT_FAMILY}`;
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

export function wrapText(
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
