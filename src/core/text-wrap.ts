const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
// JavaScript whitespace also includes the three nonbreaking separators. They
// must stay inside their word until emergency wrapping is actually necessary.
const breakableSpace = /^[^\S\u00a0\u202f\ufeff]/u;

/** Preserve editable whitespace/newlines; only insert display wraps, never ellipses. */
export function wrapEditableText(
  text: string,
  width: number,
  maxLines: number,
  measure: (text: string) => number,
): { lines: string[]; truncated: boolean } {
  if (width <= 0 || maxLines < 1) return { lines: [], truncated: text.length > 0 };
  const lines: string[] = [];
  let line = '';
  let lastBreak = 0;
  for (const { segment } of graphemes.segment(text.replace(/\r\n|\r/gu, '\n'))) {
    if (segment === '\n') {
      lines.push(line);
      if (lines.length >= maxLines) return { lines, truncated: true };
      line = '';
      lastBreak = 0;
      continue;
    }
    while (line && measure(line + segment) > width) {
      const split = lastBreak || line.length;
      lines.push(line.slice(0, split));
      if (lines.length >= maxLines) return { lines, truncated: true };
      line = line.slice(split);
      lastBreak = 0;
    }
    line += segment;
    // Store a whole grapheme boundary, not the whitespace code unit: a space
    // can itself carry a combining mark which must not start the next line.
    if (breakableSpace.test(segment)) lastBreak = line.length;
  }
  lines.push(line);
  return { lines, truncated: false };
}
