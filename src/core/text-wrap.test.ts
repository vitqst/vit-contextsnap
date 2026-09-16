import { describe, expect, it } from 'vitest';
import { wrapEditableText } from './text-wrap';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const monospaceWidth = (text: string) => Array.from(graphemes.segment(text)).length;

describe('editable text wrapping', () => {
  it.each(['\u00a0', '\u202f', '\ufeff'])(
    'prefers a real space over a nonbreaking separator %j',
    (separator) => {
      const text = `a bb${separator}cc`;
      expect(wrapEditableText(text, 6, Infinity, monospaceWidth)).toEqual({
        lines: ['a ', `bb${separator}cc`],
        truncated: false,
      });
    },
  );

  it('never separates a combining mark from the space used as its base', () => {
    const text = 'a \u0301bbbb';
    expect(wrapEditableText(text, 4, Infinity, monospaceWidth)).toEqual({
      lines: ['a \u0301', 'bbbb'],
      truncated: false,
    });
  });

  it('keeps preserved spaces, CRLF paragraphs, and the final caret line', () => {
    expect(wrapEditableText('  A  B\r\n\r\nC\r', 20, Infinity, monospaceWidth)).toEqual({
      lines: ['  A  B', '', 'C', ''],
      truncated: false,
    });
  });

  it('does not measure an unbounded tail after reaching the line limit', () => {
    let measuredCharacters = 0;
    const result = wrapEditableText(`word ${'tail '.repeat(10000)}`, 6, 2, (text) => {
      measuredCharacters += text.length;
      return monospaceWidth(text);
    });
    expect(result).toEqual({ lines: ['word ', 'tail '], truncated: true });
    expect(measuredCharacters).toBeLessThan(100);
  });
});
