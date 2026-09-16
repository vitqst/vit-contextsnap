import { test, expect } from './bridge';

test('dragging a large image reuses its sharp display raster and exports original pixels', async ({
  desktop: page,
}, testInfo) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const base = document.createElement('canvas');
    base.width = base.height = 100;
    const large = document.createElement('canvas');
    large.width = 3840;
    large.height = 2160;
    const ink = large.getContext('2d')!;
    ink.fillStyle = '#ffffff';
    ink.fillRect(0, 0, large.width, large.height);
    ink.fillStyle = '#172033';
    for (let y = 0; y < large.height; y += 4) ink.fillRect(0, y, large.width, 2);
    const original = await createImageBitmap(large);
    const assets = new Map([
      ['photo', { id: 'photo', source: original, width: large.width, height: large.height }],
    ]);
    const output = document.createElement('canvas');
    output.width = 1000;
    output.height = 700;
    const ctx = output.getContext('2d')!;
    let object = {
      id: 'image',
      type: 'image',
      seed: 1,
      style: { color: '#ff0000', width: 4, sketch: false },
      assetId: 'photo',
      rect: { x: 100, y: 100, width: 768, height: 432 },
    };
    const preview = () => {
      ctx.setTransform(0.8, 0, 0, 0.8, 20, 20);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      drawScene(ctx, base, [object], undefined, assets, { expandedBackground: false });
    };
    preview();
    ctx.getImageData(200, 200, 1, 1);
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    let originalDraws = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      if (args[0] === original) originalDraws++;
      return Reflect.apply(draw, this, args);
    };
    try {
      const elapsed: number[] = [];
      for (let frame = 0; frame < 30; frame++) {
        object = { ...object, rect: { ...object.rect, x: 100 + frame } };
        const start = performance.now();
        preview();
        ctx.getImageData(200, 200, 1, 1);
        elapsed.push(performance.now() - start);
      }
      const dragOriginalDraws = originalDraws;
      elapsed.sort((a, b) => a - b);
      const previewPixel = [...ctx.getImageData(200, 200, 1, 1).data];

      // Export at original resolution after warming the low-resolution preview cache.
      output.width = large.width;
      output.height = large.height;
      object = { ...object, rect: { x: 0, y: 0, width: large.width, height: large.height } };
      drawScene(ctx, base, [object], undefined, assets);
      const exported = ctx.getImageData(500, 0, 1, 4).data;
      const expected = ink.getImageData(500, 0, 1, 4).data;
      return {
        dragOriginalDraws,
        medianMs: elapsed[Math.floor(elapsed.length / 2)],
        p95Ms: elapsed[Math.floor(elapsed.length * 0.95)],
        previewPixel,
        originalExportPixels: [...exported],
        expectedExportPixels: [...expected],
      };
    } finally {
      CanvasRenderingContext2D.prototype.drawImage = draw;
      original.close();
    }
  }, `/@fs${process.cwd()}/src`);
  console.log('large-image drag:', result);
  await testInfo.attach('image-drag-timing.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.previewPixel[3]).toBe(255);
  expect(result.previewPixel[0], 'Fine stripes should blend, not alias to white').toBeGreaterThan(
    100,
  );
  expect(result.previewPixel[0], 'Fine stripes should blend, not alias to white').toBeLessThan(175);
  expect(result.originalExportPixels).toEqual(result.expectedExportPixels);
  expect(result.dragOriginalDraws, 'Translation must not repeatedly resample the full image').toBe(
    0,
  );
});
