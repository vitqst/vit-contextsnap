import { test, expect } from './bridge';

test('moving a blur reuses the unchanged image underlay, including beyond screenshot edges', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 960;
    source.height = 640;
    const background = source.getContext('2d')!;
    background.fillStyle = '#ffffff';
    background.fillRect(0, 0, 960, 640);
    const stamp = document.createElement('canvas');
    stamp.width = 320;
    stamp.height = 200;
    const ink = stamp.getContext('2d')!;
    ink.fillStyle = '#2563eb';
    ink.fillRect(0, 0, 320, 200);
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 320, height: 200 }]]);
    const base = { seed: 1, style: { color: '#ff0000', width: 4, sketch: false, shadow: false } };
    let layer = {
      ...base,
      id: 'image',
      type: 'image',
      assetId: 'stamp',
      rect: { x: 200, y: 200, width: 320, height: 200 },
    };
    const blur = {
      ...base,
      id: 'blur',
      type: 'blur',
      rect: { x: 100, y: 100, width: 200, height: 200 },
      strength: 12,
    };
    const output = document.createElement('canvas');
    output.width = 960;
    output.height = 640;
    const ctx = output.getContext('2d')!;
    const render = (x: number) =>
      drawScene(ctx, source, [layer, { ...blur, rect: { ...blur.rect, x } }], undefined, assets, {
        expandedBackground: false,
        previewEffects: true,
      });
    render(100);
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    let backgroundPaints = 0;
    let imagePaints = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      if (args[0] === source) backgroundPaints++;
      if (args[0] === stamp) imagePaints++;
      return Reflect.apply(draw, this, args);
    };
    try {
      for (const x of [110, 120, 130, -50, -100]) render(x);
      const unchanged = { backgroundPaints, imagePaints };
      const blueBefore = [...ctx.getImageData(220, 220, 1, 1).data];
      layer = { ...layer, rect: { ...layer.rect, x: 550 } };
      render(-100);
      return {
        unchanged,
        changed: { backgroundPaints, imagePaints },
        blueBefore,
        previousPosition: [...ctx.getImageData(220, 220, 1, 1).data],
        nextPosition: [...ctx.getImageData(570, 220, 1, 1).data],
      };
    } finally {
      CanvasRenderingContext2D.prototype.drawImage = draw;
    }
  }, `/@fs${process.cwd()}/src`);
  expect(result.unchanged, 'Only the blur changed; source images must stay cached').toEqual({
    backgroundPaints: 0,
    imagePaints: 0,
  });
  expect(result.changed).toEqual({ backgroundPaints: 1, imagePaints: 1 });
  expect(result.blueBefore).toEqual([37, 99, 235, 255]);
  expect(result.previousPosition).toEqual([255, 255, 255, 255]);
  expect(result.nextPosition).toEqual([37, 99, 235, 255]);
});

test('cached blur underlays invalidate moved and removed masks without leaking changed secrets', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 240;
    source.height = 160;
    const background = source.getContext('2d')!;
    background.fillStyle = '#ffffff';
    background.fillRect(0, 0, 240, 160);
    const asset = (color: string) => {
      const stamp = document.createElement('canvas');
      stamp.width = stamp.height = 60;
      const ink = stamp.getContext('2d')!;
      ink.fillStyle = color;
      ink.fillRect(0, 0, 60, 60);
      return new Map([['secret', { id: 'secret', source: stamp, width: 60, height: 60 }]]);
    };
    const redAssets = asset('#ff0000');
    const blueAssets = asset('#0000ff');
    const base = { seed: 1, style: { color: '#ff0000', width: 2, sketch: false, shadow: false } };
    const layer = {
      ...base,
      id: 'image',
      type: 'image',
      assetId: 'secret',
      rect: { x: 20, y: 20, width: 60, height: 60 },
    };
    const blur = {
      ...base,
      id: 'blur',
      type: 'blur',
      rect: { x: 10, y: 10, width: 100, height: 100 },
      strength: 12,
    };
    const mask = {
      ...base,
      id: 'mask',
      type: 'redact',
      rect: { x: 20, y: 20, width: 60, height: 60 },
    };
    const output = document.createElement('canvas');
    output.width = 160;
    output.height = 120;
    const ctx = output.getContext('2d')!;
    ctx.scale(0.57, 0.57);
    const render = (redaction: typeof mask | null, assets = blueAssets) => {
      drawScene(ctx, source, [layer, blur, ...(redaction ? [redaction] : [])], undefined, assets, {
        expandedBackground: false,
        previewEffects: true,
      });
      return {
        pixels: ctx.getImageData(0, 0, output.width, output.height).data,
        oldMask: [...ctx.getImageData(22, 22, 1, 1).data],
        newMask: [...ctx.getImageData(102, 22, 1, 1).data],
      };
    };
    const red = render(mask, redAssets);
    const blue = render(mask);
    let secretChanges = 0;
    for (let index = 0; index < red.pixels.length; index++)
      if (red.pixels[index] !== blue.pixels[index]) secretChanges++;
    const moved = render({ ...mask, rect: { x: 160, y: 20, width: 40, height: 40 } });
    const removed = render(null);
    return {
      secretChanges,
      protectedPixel: blue.oldMask,
      movedOldMask: moved.oldMask,
      movedNewMask: moved.newMask,
      removedNewMask: removed.newMask,
    };
  }, `/@fs${process.cwd()}/src`);
  expect(
    result.secretChanges,
    'Masked secrets must not affect blur or fractional preview pixels',
  ).toBe(0);
  expect(result.protectedPixel).toEqual([0, 0, 0, 255]);
  expect(
    result.movedOldMask[2],
    'The old mask must not remain baked into the cached underlay',
  ).toBeGreaterThan(100);
  expect(result.movedNewMask).toEqual([0, 0, 0, 255]);
  expect(result.removedNewMask).toEqual([255, 255, 255, 255]);
});

test('blur underlays follow layer order and replacement asset identities at negative world coordinates', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const solid = (color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    const source = solid('#ffffff');
    const blue = solid('#0000ff');
    const green = solid('#00ff00');
    const red = solid('#ff0000');
    const assets = new Map([
      ['blue', { id: 'blue', source: blue, width: 100, height: 100 }],
      ['green', { id: 'green', source: green, width: 100, height: 100 }],
    ]);
    const replacementAssets = new Map(assets);
    replacementAssets.set('blue', { id: 'blue', source: red, width: 100, height: 100 });
    const base = { seed: 1, style: { color: '#ff0000', width: 2, sketch: false, shadow: false } };
    const blueLayer = {
      ...base,
      id: 'blue-layer',
      type: 'image',
      assetId: 'blue',
      rect: { x: -40, y: -30, width: 100, height: 100 },
    };
    const greenLayer = { ...blueLayer, id: 'green-layer', assetId: 'green' };
    const blur = {
      ...base,
      id: 'blur',
      type: 'blur',
      rect: { x: 110, y: 110, width: 30, height: 30 },
      strength: 12,
    };
    const output = document.createElement('canvas');
    output.width = output.height = 240;
    const ctx = output.getContext('2d')!;
    ctx.translate(60, 60);
    const render = (objects: unknown[], currentAssets = assets) => {
      drawScene(ctx, source, objects, undefined, currentAssets, {
        expandedBackground: false,
        previewEffects: true,
      });
      // World (-20, -10): outside the screenshot, safely inside both image layers.
      return [...ctx.getImageData(40, 50, 1, 1).data];
    };
    const reordered = [greenLayer, blueLayer, blur];
    return {
      initial: render([blueLayer, greenLayer, blur]),
      reordered: render(reordered),
      replaced: render(reordered, replacementAssets),
      restored: render(reordered),
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result.initial).toEqual([0, 255, 0, 255]);
  expect(result.reordered).toEqual([0, 0, 255, 255]);
  expect(result.replaced).toEqual([255, 0, 0, 255]);
  expect(result.restored).toEqual([0, 0, 255, 255]);
});

test('unchanged object references cannot reuse approximate preview pixels for full-quality export', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const prototype = CanvasRenderingContext2D.prototype;
    const filter = Object.getOwnPropertyDescriptor(prototype, 'filter');
    const originalRead = prototype.getImageData;
    if (filter) {
      if (!filter.configurable) throw new Error('The test cannot simulate missing canvas filters.');
      Reflect.deleteProperty(prototype, 'filter');
    }
    let readPixels = 0;
    prototype.getImageData = function (...args: Parameters<typeof originalRead>) {
      readPixels += args[2] * args[3];
      return Reflect.apply(originalRead, this, args);
    };
    try {
      const source = document.createElement('canvas');
      source.width = 240;
      source.height = 180;
      const background = source.getContext('2d')!;
      background.fillStyle = '#ffffff';
      background.fillRect(0, 0, 240, 180);
      background.fillStyle = '#172033';
      for (let x = 45; x < 170; x += 4) background.fillRect(x, 10, 2, 140);
      const base = { seed: 1, style: { color: '#ff0000', width: 2, sketch: false, shadow: false } };
      const blur = Object.freeze({
        ...base,
        id: 'blur',
        type: 'blur',
        rect: Object.freeze({ x: 20, y: 20, width: 160, height: 100 }),
        strength: 12,
      });
      const outside = Object.freeze({
        ...base,
        id: 'outside',
        type: 'rectangle',
        rect: Object.freeze({ x: -50, y: 0, width: 10, height: 10 }),
      });
      // The array, blur and all geometry are the SAME immutable references in every
      // mode. Creating a fresh blur here would conceal missing option invalidation.
      const objects = Object.freeze([outside, blur]);
      const output = document.createElement('canvas');
      output.width = 360;
      output.height = 240;
      const ctx = output.getContext('2d')!;
      ctx.translate(80, 30);
      const render = (previewEffects: boolean, expandedBackground = false, image = source) => {
        const before = readPixels;
        drawScene(ctx, image, objects, undefined, undefined, {
          expandedBackground,
          previewEffects,
        });
        const pixels = Reflect.apply(originalRead, ctx, [0, 0, output.width, output.height]).data;
        return {
          pixels,
          reads: readPixels - before,
          outsideAlpha: pixels[(110 * output.width + 50) * 4 + 3],
        };
      };
      const preview = render(true);
      const cachedPreview = render(true);
      const full = render(false);
      const cachedFull = render(false);
      const previewAgain = render(true);
      const expandedExport = render(false, true);
      const transparentAgain = render(false);
      const freshSource = document.createElement('canvas');
      freshSource.width = source.width;
      freshSource.height = source.height;
      freshSource.getContext('2d')!.drawImage(source, 0, 0);
      const freshFull = render(false, false, freshSource);
      const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let count = 0;
        for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) count++;
        return count;
      };
      return {
        previewReads: preview.reads,
        cachedPreviewReads: cachedPreview.reads,
        fullReads: full.reads,
        cachedFullReads: cachedFull.reads,
        previewAgainReads: previewAgain.reads,
        approximationChanges: changed(preview.pixels, full.pixels),
        previewRepeatChanges: changed(preview.pixels, previewAgain.pixels),
        fullBaselineChanges: changed(full.pixels, freshFull.pixels),
        transparentRepeatChanges: changed(full.pixels, transparentAgain.pixels),
        outsideAlpha: [
          preview.outsideAlpha,
          expandedExport.outsideAlpha,
          transparentAgain.outsideAlpha,
        ],
      };
    } finally {
      if (filter) Object.defineProperty(prototype, 'filter', filter);
      prototype.getImageData = originalRead;
    }
  }, `/@fs${process.cwd()}/src`);
  expect(result.previewReads).toBeGreaterThan(0);
  expect(result.cachedPreviewReads).toBe(0);
  expect(result.fullReads).toBeGreaterThan(result.previewReads * 8);
  expect(result.cachedFullReads).toBe(0);
  expect(result.previewAgainReads).toBe(result.previewReads);
  expect(
    result.approximationChanges,
    'The fixture must distinguish approximate and full-resolution blur',
  ).toBeGreaterThan(0);
  expect(result.previewRepeatChanges).toBe(0);
  expect(result.fullBaselineChanges, 'Export must match a fresh full-resolution render').toBe(0);
  expect(result.transparentRepeatChanges).toBe(0);
  expect(result.outsideAlpha).toEqual([0, 255, 0]);
});
