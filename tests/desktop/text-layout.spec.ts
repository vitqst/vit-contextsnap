import { test, expect } from './bridge';

test('canvas wrapping and native input line breaks agree for spaces, accents, and emoji', async ({
  desktop: page,
}) => {
  const layouts = await page.evaluate(async (root) => {
    const { getTextLayout } = await import(`${root}/core/text-layout.ts`);
    const { LABEL_FONT_FAMILY } = await import(`${root}/core/label-layout.ts`);
    const texts = [
      'Playpen Sans wraps words into a readable text box without a background.',
      'Ghi chú tiếng Việt: kiểm tra chất lượng hình ảnh.',
      '  Start  with spaces\n\nSecond line\n',
      'averylongtokenwithnowhitespace 👨‍👩‍👧‍👦 e\u0301 e\u0301',
    ];
    return texts.flatMap((text) =>
      [110, 220, 300].map((width) => {
        const layout = getTextLayout({ position: { x: 0, y: 0 }, width, fontSize: 24, text });
        const mirror = document.createElement('div');
        Object.assign(mirror.style, {
          position: 'fixed',
          left: '-10000px',
          width: `${width}px`,
          font: `500 24px ${LABEL_FONT_FAMILY}`,
          lineHeight: `${layout.lineHeight}px`,
          whiteSpace: 'break-spaces',
          overflowWrap: 'anywhere',
          wordBreak: 'normal',
          fontKerning: 'normal',
        });
        mirror.textContent = text;
        document.body.append(mirror);
        // A textarea maintains a caret line after a final newline; a plain div needs a marker.
        if (text.endsWith('\n')) mirror.append(document.createTextNode('\u200b'));
        const domHeight = mirror.getBoundingClientRect().height;
        const domLines: string[] = [];
        let previousTop: number | undefined;
        for (let i = 0; i < text.length; i++) {
          const range = document.createRange();
          range.setStart(mirror.firstChild!, i);
          range.setEnd(mirror.firstChild!, i + 1);
          const top = range.getBoundingClientRect().top;
          if (top !== previousTop) domLines.push('');
          domLines[domLines.length - 1] = domLines[domLines.length - 1]! + text[i]!;
          previousTop = top;
        }
        mirror.remove();
        return {
          text,
          width,
          canvasHeight: layout.rect.height,
          domHeight,
          canvasLines: layout.lines,
          domLines,
        };
      }),
    );
  }, `/@fs${process.cwd()}/src`);
  expect(layouts.filter((layout) => layout.canvasHeight !== layout.domHeight)).toEqual([]);
});
