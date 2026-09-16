import { test, expect } from './bridge';

test('text cards paint their padded rounded color while disabled cards preserve legacy pixels', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 340;
    source.height = 220;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 340, 220);
    const object = {
      id: 'text',
      type: 'text',
      seed: 1,
      position: { x: 80, y: 70 },
      width: 180,
      fontSize: 24,
      text: 'Card',
      style: { color: '#182038', width: 4, sketch: false, shadow: false },
    };
    const output = document.createElement('canvas');
    output.width = 340;
    output.height = 220;
    const ctx = output.getContext('2d')!;
    const paint = (background?: { enabled: boolean; color: string }) => {
      drawScene(ctx, source, [{ ...object, background }]);
      return ctx.getImageData(0, 0, 340, 220).data;
    };
    const legacy = paint();
    const off = paint({ enabled: false, color: '#ffdd88' });
    paint({ enabled: true, color: '#ffdd88' });
    return {
      offDifference: legacy.reduce((sum, value, index) => sum + Number(value !== off[index]), 0),
      padding: [...ctx.getImageData(72, 82, 1, 1).data],
      outside: [...ctx.getImageData(67, 82, 1, 1).data],
      roundedCorner: [...ctx.getImageData(68, 58, 1, 1).data],
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result.offDifference).toBe(0);
  expect(result.padding).toEqual([255, 221, 136, 255]);
  expect(result.outside).toEqual([255, 255, 255, 255]);
  expect(result.roundedCorner).toEqual([255, 255, 255, 255]);
});

test('soft and hard text-card shadows belong only to the card, with no glyph halo or double shadow', async ({
  desktop: page,
}) => {
  const results = await page.evaluate(async (root) => {
    const { drawObject } = await import(`${root}/editor/render.ts`);
    const { LABEL_FONT_FAMILY } = await import(`${root}/core/label-layout.ts`);
    const { objectShadow } = await import(`${root}/core/shadows.ts`);
    return ['soft', 'hard'].map((shadowKind) => {
      const object = {
        id: 'text',
        type: 'text',
        seed: 1,
        position: { x: 80, y: 70 },
        width: 180,
        fontSize: 24,
        text: 'Card',
        background: { enabled: true, color: '#ffdd88' },
        style: { color: '#182038', width: 4, sketch: false, shadow: true, shadowKind },
      };
      const make = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 340;
        canvas.height = 220;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 340, 220);
        return context;
      };
      const actual = make();
      drawObject(actual, object);
      // Independent native-canvas reference: one rounded card shadow, then plain
      // fillText at the unchanged legacy baseline. No strokeText is involved.
      const expected = make();
      const shadow = objectShadow(object.style)!;
      expected.shadowColor = shadow.color;
      expected.shadowBlur = shadow.blur;
      expected.shadowOffsetX = shadow.x;
      expected.shadowOffsetY = shadow.y;
      expected.fillStyle = '#ffdd88';
      expected.beginPath();
      expected.roundRect(68, 58, 204, 56, 6);
      expected.fill();
      expected.shadowColor = 'transparent';
      expected.shadowBlur = expected.shadowOffsetX = expected.shadowOffsetY = 0;
      expected.fillStyle = '#182038';
      expected.font = `500 24px ${LABEL_FONT_FAMILY}`;
      expected.fontKerning = 'normal';
      expected.textBaseline = 'middle';
      expected.fillText('Card', 80, 86);
      const first = actual.getImageData(0, 0, 340, 220).data;
      const second = expected.getImageData(0, 0, 340, 220).data;
      return {
        shadowKind,
        difference: first.reduce((sum, value, index) => sum + Number(value !== second[index]), 0),
        shadowPixel: [...actual.getImageData(274, 90, 1, 1).data],
      };
    });
  }, `/@fs${process.cwd()}/src`);
  for (const result of results) {
    expect(result.difference, result.shadowKind).toBe(0);
    expect(result.shadowPixel[0], result.shadowKind).toBeLessThan(255);
  }
});

test('magnifier sources include text-card backgrounds and invalidate after card-only changes', async ({
  desktop: page,
}) => {
  const pixels = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 340;
    source.height = 220;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 340, 220);
    const style = { color: '#182038', width: 2, sketch: false, shadow: false };
    const text = {
      id: 'text',
      type: 'text',
      seed: 1,
      style,
      position: { x: 80, y: 70 },
      width: 180,
      fontSize: 24,
      text: 'Card',
    };
    const lens = {
      id: 'lens',
      type: 'magnifier',
      seed: 2,
      style,
      center: { x: 74, y: 85 },
      radius: 28,
      zoom: 2,
    };
    const output = document.createElement('canvas');
    output.width = 340;
    output.height = 220;
    const ctx = output.getContext('2d')!;
    return [
      { enabled: true, color: '#ffdd88' },
      { enabled: false, color: '#ffdd88' },
      { enabled: true, color: '#3366cc' },
    ].map((background) => {
      drawScene(ctx, source, [{ ...text, background }, lens]);
      return [...ctx.getImageData(74, 85, 1, 1).data];
    });
  }, `/@fs${process.cwd()}/src`);
  expect(pixels).toEqual([
    [255, 221, 136, 255],
    [255, 255, 255, 255],
    [51, 102, 204, 255],
  ]);
});

test('expanded PNG exports retain negative-position text-card padding', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { flattenImage, loadImage } = await import(`${root}/export/image.ts`);
    const source = document.createElement('canvas');
    source.width = 100;
    source.height = 80;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 80);
    const png = await new Promise<Blob>((resolve) =>
      source.toBlob((blob) => resolve(blob!), 'image/png'),
    );
    const image = await loadImage(png);
    const object = {
      id: 'text',
      type: 'text',
      seed: 1,
      position: { x: -8, y: -6 },
      width: 120,
      fontSize: 20,
      text: 'Card',
      background: { enabled: true, color: '#ffdd88' },
      style: { color: '#182038', width: 4, sketch: false, shadow: false },
    };
    const flattened = await flattenImage(image, { version: 1, crop: null, objects: [object] });
    const exported = await loadImage(flattened);
    source.width = exported.naturalWidth;
    source.height = exported.naturalHeight;
    ctx.drawImage(exported, 0, 0);
    return {
      width: source.width,
      height: source.height,
      padding: [...ctx.getImageData(4, 20, 1, 1).data],
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result).toEqual({ width: 144, height: 98, padding: [255, 221, 136, 255] });
});

test('masked text-card contents cannot leak through shadows, blur, or magnifier sources', async ({
  desktop: page,
}) => {
  const differences = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 340;
    source.height = 240;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 340, 240);
    const results = [];
    for (const shadowKind of ['soft', 'hard']) {
      for (const previewEffects of [false, true]) {
        const style = { color: '#182038', width: 2, sketch: false, shadow: true, shadowKind };
        const text = {
          id: 'text',
          type: 'text',
          seed: 1,
          style,
          position: { x: 80, y: 70 },
          width: 200,
          fontSize: 24,
          background: { enabled: true, color: '#ffdd88' },
        };
        const effects = [
          {
            id: 'redact',
            type: 'redact',
            seed: 2,
            style,
            rect: { x: 80, y: 70, width: 200, height: 32 },
          },
          {
            id: 'blur',
            type: 'blur',
            seed: 3,
            style,
            rect: { x: 60, y: 50, width: 240, height: 90 },
            strength: 12,
          },
          {
            id: 'lens',
            type: 'magnifier',
            seed: 4,
            style,
            center: { x: 175, y: 88 },
            radius: 68,
            zoom: 2,
          },
        ];
        const output = document.createElement('canvas');
        output.width = 340;
        output.height = 240;
        const ctx = output.getContext('2d')!;
        const paint = (value: string) => {
          drawScene(ctx, source, [{ ...text, text: value }, ...effects], undefined, undefined, {
            previewEffects,
          });
          return ctx.getImageData(0, 0, 340, 240).data;
        };
        const secret = paint('SECRET');
        const publicText = paint('PUBLIC');
        results.push(
          secret.reduce((sum, value, index) => sum + Number(value !== publicText[index]), 0),
        );
      }
    }
    return results;
  }, `/@fs${process.cwd()}/src`);
  expect(differences).toEqual([0, 0, 0, 0]);
});
