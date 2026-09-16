import { test, expect } from './bridge';

for (const type of ['sticky', 'arrow'] as const) {
  test(`${type} preview shadows retain their world size when zoomed`, async ({ desktop: page }) => {
    const results = await page.evaluate(
      async ({ root, type }) => {
        const { drawScene } = await import(`${root}/editor/render.ts`);
        const source = document.createElement('canvas');
        source.width = source.height = 400;
        const sourceContext = source.getContext('2d')!;
        sourceContext.fillStyle = '#ffffff';
        sourceContext.fillRect(0, 0, 400, 400);
        const base = {
          id: type,
          seed: 1,
          style: { color: '#ffe58f', width: 4, sketch: false, shadow: true },
        };
        const object =
          type === 'sticky'
            ? {
                ...base,
                type,
                rect: { x: 100, y: 100, width: 200, height: 100 },
                text: '',
                fontSize: 24,
              }
            : {
                ...base,
                type,
                start: { x: 100, y: 200 },
                end: { x: 300, y: 200 },
                control: { x: 200, y: 200 },
                mode: 'straight',
                label: '',
              };
        const full = document.createElement('canvas');
        full.width = full.height = 400;
        drawScene(full.getContext('2d')!, source, [object]);
        return [0.25, 2].map((scale) => {
          const expected = document.createElement('canvas');
          expected.width = expected.height = 400 * scale;
          const reference = expected.getContext('2d')!;
          reference.imageSmoothingEnabled = true;
          reference.imageSmoothingQuality = 'high';
          reference.drawImage(full, 0, 0, expected.width, expected.height);
          const preview = document.createElement('canvas');
          preview.width = preview.height = expected.width;
          const ctx = preview.getContext('2d')!;
          ctx.scale(scale, scale);
          drawScene(ctx, source, [object], undefined, undefined, { expandedBackground: false });
          // Sample just the shadow below the shape, away from antialiased shape edges.
          const from = Math.ceil((type === 'sticky' ? 208 : 204) * scale);
          const count = Math.ceil(265 * scale) - from;
          const actual = ctx.getImageData(200 * scale, from, 1, count).data;
          const target = reference.getImageData(200 * scale, from, 1, count).data;
          let maxDifference = 0;
          for (let index = 0; index < actual.length; index += 4)
            maxDifference = Math.max(maxDifference, Math.abs(actual[index]! - target[index]!));
          return { scale, maxDifference };
        });
      },
      { root: `/@fs${process.cwd()}/src`, type },
    );
    for (const result of results)
      expect(
        result.maxDifference,
        `${type} shadow at ${result.scale} raster scale`,
      ).toBeLessThanOrEqual(8);
  });
}
