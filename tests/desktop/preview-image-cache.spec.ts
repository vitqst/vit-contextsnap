import { test, expect } from './bridge';

test('preview raster follows physical size, reuses translations, and restores 1:1 detail', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawPreviewImage } = await import(`${root}/editor/preview-image.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 512;
    const ink = source.getContext('2d')!;
    ink.fillStyle = '#ffffff';
    ink.fillRect(0, 0, 512, 512);
    ink.fillStyle = '#000000';
    for (let x = 0; x < 512; x += 2) ink.fillRect(x, 0, 1, 512);
    const output = document.createElement('canvas');
    output.width = output.height = 512;
    const ctx = output.getContext('2d')!;
    const drawn: CanvasImageSource[] = [];
    const draw = ctx.drawImage;
    ctx.drawImage = function (...args: unknown[]) {
      drawn.push(args[0] as CanvasImageSource);
      return Reflect.apply(draw, this, args);
    };
    drawPreviewImage(ctx, source, { x: 0, y: 0, width: 64, height: 64 });
    drawPreviewImage(ctx, source, { x: 20, y: 30, width: 64, height: 64 });
    const translationReused = drawn[0] === drawn[1];
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawPreviewImage(ctx, source, { x: 0, y: 0, width: 64, height: 64 });
    const densityRefreshed = drawn[2] !== drawn[1];
    const densityWidth = (drawn[2] as HTMLCanvasElement).width;
    drawPreviewImage(ctx, source, { x: 0, y: 0, width: 128, height: 128 });
    const resizeRefreshed = drawn[3] !== drawn[2];
    const resizeWidth = (drawn[3] as HTMLCanvasElement).width;
    ctx.setTransform(4, 0, 0, 4, 0, 0);
    drawPreviewImage(ctx, source, { x: 0, y: 0, width: 128, height: 128 });
    return {
      translationReused,
      densityRefreshed,
      densityWidth,
      resizeRefreshed,
      resizeWidth,
      originalAtOneToOne: drawn[4] === source,
      detail: [...ctx.getImageData(0, 10, 2, 1).data],
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result).toEqual({
    translationReused: true,
    densityRefreshed: true,
    densityWidth: 128,
    resizeRefreshed: true,
    resizeWidth: 256,
    originalAtOneToOne: true,
    detail: [0, 0, 0, 255, 255, 255, 255, 255],
  });
});

test('preview rasters evict old images within the pixel and entry budgets', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawPreviewImage } = await import(`${root}/editor/preview-image.ts`);
    const output = document.createElement('canvas');
    output.width = output.height = 1000;
    const ctx = output.getContext('2d')!;
    const rasters = new Set<HTMLCanvasElement>();
    const draw = ctx.drawImage;
    ctx.drawImage = function (...args: unknown[]) {
      rasters.add(args[0] as HTMLCanvasElement);
      return Reflect.apply(draw, this, args);
    };
    const sources: HTMLCanvasElement[] = [];
    for (let i = 0; i < 21; i++) {
      const source = document.createElement('canvas');
      source.width = source.height = 1024;
      const ink = source.getContext('2d')!;
      ink.fillStyle = '#2563eb';
      ink.fillRect(0, 0, 1024, 1024);
      sources.push(source);
      drawPreviewImage(ctx, source, { x: 0, y: 0, width: 100, height: 100 });
    }
    const retainedEntries = [...rasters].filter((raster) => raster.width > 1).length;
    for (const source of sources.slice(0, 6))
      drawPreviewImage(ctx, source, { x: 0, y: 0, width: 1000, height: 1000 });
    const retainedPixels = [...rasters]
      .filter((raster) => raster.width > 1)
      .reduce((total, raster) => total + raster.width * raster.height, 0);
    drawPreviewImage(ctx, sources[0]!, { x: 0, y: 0, width: 100, height: 100 });
    return {
      retainedEntries,
      retainedPixels,
      afterEviction: [...ctx.getImageData(10, 10, 1, 1).data],
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result.retainedEntries).toBeLessThanOrEqual(16);
  expect(result.retainedPixels).toBeLessThanOrEqual(4_000_000);
  expect(result.afterEviction).toEqual([37, 99, 235, 255]);
});

test('two differently sized copies of one image do not evict each other every frame', async ({
  desktop: page,
}) => {
  const resamples = await page.evaluate(async (root) => {
    const { drawPreviewImage } = await import(`${root}/editor/preview-image.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 512;
    const output = document.createElement('canvas');
    output.width = output.height = 512;
    const ctx = output.getContext('2d')!;
    const small = { x: 0, y: 0, width: 64, height: 64 };
    const large = { x: 100, y: 100, width: 128, height: 128 };
    drawPreviewImage(ctx, source, small);
    drawPreviewImage(ctx, source, large);
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    let samples = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      if (args[0] === source) samples++;
      return Reflect.apply(draw, this, args);
    };
    try {
      for (let frame = 0; frame < 5; frame++) {
        drawPreviewImage(ctx, source, { ...small, x: frame });
        drawPreviewImage(ctx, source, { ...large, x: 100 + frame });
      }
      return samples;
    } finally {
      CanvasRenderingContext2D.prototype.drawImage = draw;
    }
  }, `/@fs${process.cwd()}/src`);
  expect(resamples).toBe(0);
});
