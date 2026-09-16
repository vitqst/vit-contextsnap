import { describe, expect, it } from 'vitest';
import { getTextLabelLayout, measureText } from './label-layout';

const anchor = () => ({ x: 200, y: 200 });

describe('editable label layout', () => {
  it('publishes the actual wrap width independently of padded tight hit bounds', () => {
    const label = getTextLabelLayout('Short', 20, anchor);
    expect(label.contentWidth).toBe(300);
    expect(label.rect.width).toBeLessThan(label.contentWidth);
    const cropped = getTextLabelLayout('Short', 20, anchor, {
      x: 0,
      y: 0,
      width: 120,
      height: 200,
    });
    expect(cropped.contentWidth).toBe(100);
  });

  it('preserves indentation, repeated spaces, blank paragraphs, and the trailing caret line', () => {
    const label = getTextLabelLayout('  First  \n\nSecond\n', 20, anchor);
    expect(label.lines).toEqual(['  First  ', '', 'Second', '']);
    expect(label.truncated).toBe(false);
  });

  it('reserves a caret line for an empty label without inventing document text', () => {
    const label = getTextLabelLayout('', 20, anchor);
    expect(label.lines).toEqual([]);
    expect(label.rect.height).toBeGreaterThanOrEqual(label.lineHeight);
  });

  it('inserts display wraps without stripping spaces from the editable string', () => {
    const text = 'one two three four five';
    const label = getTextLabelLayout(text, 20, anchor, { x: 0, y: 0, width: 110, height: 300 });
    expect(label.lines.join('')).toBe(text);
    expect(label.lines.length).toBeGreaterThan(1);
    for (const line of label.lines)
      expect(measureText(line, 20)).toBeLessThanOrEqual(label.contentWidth);
  });

  it('keeps combining marks with their grapheme while wrapping labels', () => {
    const text = 'e\u0301'.repeat(10);
    const label = getTextLabelLayout(text, 20, anchor, { x: 0, y: 0, width: 100, height: 300 });
    expect(label.lines.join('')).toBe(text);
    expect(label.lines.every((line) => !line.startsWith('\u0301'))).toBe(true);
    expect(label.truncated).toBe(false);
  });
});
