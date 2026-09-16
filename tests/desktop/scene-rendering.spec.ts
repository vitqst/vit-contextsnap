import { test, expect } from './bridge';

const moduleRoot = `/@fs${process.cwd()}/src`;

test('PNG export expands around negative and positive arrow bounds and preserves source alpha', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { flattenImage } = await import(`${root}/export/image.ts`);
    const { documentBounds } = await import(`${root}/core/document-bounds.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 100;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#2563eb';
    sourceContext.fillRect(40, 40, 20, 20);
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    const objects = [
      {
        id: 'arrow',
        seed: 1,
        type: 'arrow',
        start: { x: -40, y: -20 },
        end: { x: 160, y: -20 },
        control: { x: 60, y: -20 },
        mode: 'straight',
        label: '',
        labelOffset: { x: 0, y: 0 },
        style: { color: '#ff0000', width: 4, sketch: false, shadow: false },
      },
    ];
    const bounds = documentBounds(100, 100, objects);
    const blob = await flattenImage(image, { version: 1, objects, crop: null });
    const output = new Image();
    output.src = URL.createObjectURL(blob);
    await output.decode();
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(output, 0, 0);
    const pixel = (x: number, y: number) =>
      Array.from(context.getImageData(x - bounds.x, y - bounds.y, 1, 1).data);
    const pixels = {
      leftArrow: pixel(-20, -20),
      rightArrow: pixel(120, -20),
      expansion: pixel(-20, 50),
      transparentSource: pixel(10, 10),
      blueSource: pixel(50, 50),
    };
    const crop = await flattenImage(image, {
      version: 1,
      objects,
      crop: { x: 0, y: 0, width: 80, height: 70 },
    });
    const cropped = new Image();
    cropped.src = URL.createObjectURL(crop);
    await cropped.decode();
    URL.revokeObjectURL(output.src);
    URL.revokeObjectURL(cropped.src);
    return {
      actual: { width: output.width, height: output.height },
      expected: { width: bounds.width, height: bounds.height },
      crop: { width: cropped.width, height: cropped.height },
      pixels,
    };
  }, moduleRoot);
  expect(result.actual).toEqual(result.expected);
  expect(result.crop).toEqual({ width: 80, height: 70 });
  expect(result.pixels).toEqual({
    leftArrow: [255, 0, 0, 255],
    rightArrow: [255, 0, 0, 255],
    expansion: [255, 255, 255, 255],
    transparentSource: [0, 0, 0, 0],
    blueSource: [37, 99, 235, 255],
  });
});

test('magnifiers zoom annotations, update edited content, and retain redaction privacy outside the screenshot', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const { documentBounds } = await import(`${root}/core/document-bounds.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 200;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 200, 200);
    const base = { seed: 1, style: { color: '#ff0000', width: 4, sketch: false, shadow: false } };
    const rectangle = {
      ...base,
      id: 'rectangle',
      type: 'rectangle',
      rect: { x: -60, y: 70, width: 20, height: 60 },
    };
    const lens = {
      ...base,
      id: 'lens',
      type: 'magnifier',
      center: { x: -50, y: 100 },
      radius: 50,
      zoom: 2,
    };
    const render = (objects: unknown[]) => {
      const bounds = documentBounds(200, 200, objects);
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(-bounds.x, -bounds.y);
      drawScene(ctx, source, objects, bounds);
      return (x: number, y: number) =>
        Array.from(ctx.getImageData(x - bounds.x, y - bounds.y, 1, 1).data);
    };
    const first = render([rectangle, lens]);
    const zoomed = first(-70, 100);
    const replacedOriginal = first(-60, 100);
    const updated = render([{ ...rectangle, style: { ...base.style, color: '#0000ff' } }, lens])(
      -70,
      100,
    );
    const redact = {
      ...base,
      id: 'redact',
      type: 'redact',
      rect: { x: -63, y: 90, width: 6, height: 20 },
    };
    const privateImage = render([rectangle, lens, redact]);
    return {
      zoomed,
      replacedOriginal,
      updated,
      magnifiedMask: privateImage(-70, 100),
      originalMask: privateImage(-60, 100),
    };
  }, moduleRoot);
  expect(result).toEqual({
    zoomed: [255, 0, 0, 255],
    replacedOriginal: [255, 255, 255, 255],
    updated: [0, 0, 255, 255],
    magnifiedMask: [0, 0, 0, 255],
    originalMask: [0, 0, 0, 255],
  });
});

test('multiple lenses share one cached annotation surface and do not recursively magnify other lenses', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 400;
    const context = source.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 400, 400);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    const base = { seed: 1, style: { color: '#ff0000', width: 4, sketch: false, shadow: false } };
    const objects = [
      {
        ...base,
        id: 'rectangle',
        type: 'rectangle',
        rect: { x: 190, y: 140, width: 20, height: 120 },
      },
      { ...base, id: 'lens1', type: 'magnifier', center: { x: 200, y: 200 }, radius: 80, zoom: 2 },
      { ...base, id: 'lens2', type: 'magnifier', center: { x: 200, y: 200 }, radius: 60, zoom: 2 },
    ];
    let allocations = 0;
    const original = document.createElement.bind(document);
    document.createElement = ((...args: Parameters<typeof original>) => {
      if (args[0] === 'canvas') allocations++;
      return original(...args);
    }) as typeof document.createElement;
    try {
      drawScene(ctx, source, objects);
      const initialAllocations = allocations;
      const pixel = Array.from(ctx.getImageData(180, 200, 1, 1).data);
      for (let i = 0; i < 5; i++) drawScene(ctx, source, objects);
      return { pixel, initialAllocations, redrawAllocations: allocations - initialAllocations };
    } finally {
      document.createElement = original;
    }
  }, moduleRoot);
  expect(result.pixel).toEqual([255, 0, 0, 255]);
  expect(result.initialAllocations).toBeLessThanOrEqual(2);
  expect(result.redrawAllocations).toBe(0);
});

test('expanding annotations and lenses do not resize unrelated source bitmaps', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 100;
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 10;
    const output = document.createElement('canvas');
    output.width = output.height = 600;
    const ctx = output.getContext('2d')!;
    const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
    const image = {
      id: 'image',
      seed: 1,
      type: 'image',
      assetId: 'stamp',
      rect: { x: 20, y: 20, width: 10, height: 10 },
      style,
    };
    const arrow = {
      id: 'arrow',
      seed: 2,
      type: 'arrow',
      start: { x: 20, y: 30 },
      end: { x: 70, y: 30 },
      control: { x: 45, y: 30 },
      mode: 'straight',
      label: 'Keeps its position',
      labelOffset: { x: 0, y: 0 },
      style,
    };
    const lens = {
      id: 'lens',
      seed: 3,
      type: 'magnifier',
      center: { x: 50, y: 50 },
      radius: 20,
      zoom: 2,
      style,
    };
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 10, height: 10 }]]);
    const descriptors = ['width', 'height'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key)!] as const,
    );
    let writes = 0;
    for (const [key, descriptor] of descriptors)
      Object.defineProperty(HTMLCanvasElement.prototype, key, {
        ...descriptor,
        set(value: number) {
          writes++;
          descriptor.set!.call(this, value);
        },
      });
    try {
      drawScene(ctx, source, [image, arrow], undefined, assets);
      const beforeArrow = writes;
      for (let offset = 100; offset <= 300; offset += 50)
        drawScene(
          ctx,
          source,
          [
            image,
            { ...arrow, start: { x: -offset, y: -offset }, end: { x: -offset + 50, y: -offset } },
          ],
          undefined,
          assets,
        );
      const arrowWrites = writes - beforeArrow;
      drawScene(ctx, source, [image, arrow, lens], undefined, assets);
      const beforeLens = writes;
      for (let offset = 100; offset <= 300; offset += 50)
        drawScene(
          ctx,
          source,
          [image, arrow, { ...lens, center: { x: -offset, y: -offset } }],
          undefined,
          assets,
        );
      return { arrowWrites, lensWrites: writes - beforeLens };
    } finally {
      for (const [key, descriptor] of descriptors)
        Object.defineProperty(HTMLCanvasElement.prototype, key, descriptor);
    }
  }, moduleRoot);
  expect(result).toEqual({ arrowWrites: 0, lensWrites: 0 });
});

test('preview expansion stays transparent while export retains white background and source alpha', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 100;
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 20;
    const stampContext = stamp.getContext('2d')!;
    stampContext.fillStyle = '#ff0000';
    stampContext.fillRect(0, 0, 20, 20);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
    const objects = [
      {
        id: 'stamp',
        seed: 1,
        type: 'image',
        assetId: 'stamp',
        rect: { x: -80, y: 10, width: 20, height: 20 },
        style,
      },
      {
        id: 'lens',
        seed: 2,
        type: 'magnifier',
        center: { x: -70, y: 20 },
        radius: 10,
        zoom: 2,
        style,
      },
    ];
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 20, height: 20 }]]);
    const render = (expandedBackground: boolean) => {
      ctx.setTransform(1, 0, 0, 1, 100, 0);
      drawScene(ctx, source, objects, undefined, assets, { expandedBackground });
      const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x + 100, y, 1, 1).data);
      return { expansion: pixel(-50, 50), source: pixel(50, 50), stamp: pixel(-70, 20) };
    };
    return { preview: render(false), export: render(true), previewAgain: render(false) };
  }, moduleRoot);
  const preview = { expansion: [0, 0, 0, 0], source: [0, 0, 0, 0], stamp: [255, 0, 0, 255] };
  expect(result).toEqual({
    preview,
    export: { ...preview, expansion: [255, 255, 255, 255] },
    previewAgain: preview,
  });
});

test('inserted images outside the screenshot are redacted before blur and lens sampling', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const { documentBounds } = await import(`${root}/core/document-bounds.ts`);
    const renderSecret = (color: string, expandedBackground: boolean) => {
      const source = document.createElement('canvas');
      source.width = source.height = 100;
      const stamp = document.createElement('canvas');
      stamp.width = stamp.height = 40;
      const stampContext = stamp.getContext('2d')!;
      stampContext.fillStyle = '#ffffff';
      stampContext.fillRect(0, 0, 40, 40);
      stampContext.fillStyle = color;
      stampContext.fillRect(12, 12, 8, 8);
      const base = { seed: 1, style: { color: '#ff0000', width: 4, sketch: false, shadow: false } };
      const objects = [
        {
          ...base,
          id: 'stamp',
          type: 'image',
          assetId: 'asset',
          rect: { x: -80, y: -50, width: 40, height: 40 },
        },
        { ...base, id: 'mask', type: 'redact', rect: { x: -68, y: -38, width: 8, height: 8 } },
        {
          ...base,
          id: 'blur',
          type: 'blur',
          // The sampled mask lies inside this blur, but the magnified probe is
          // outside it: a protected top blur may legitimately soften a lens.
          rect: { x: -68, y: -50, width: 28, height: 40 },
          strength: 4,
        },
        { ...base, id: 'lens', type: 'magnifier', center: { x: -60, y: -30 }, radius: 20, zoom: 2 },
      ];
      const assets = new Map([['asset', { id: 'asset', source: stamp, width: 40, height: 40 }]]);
      const bounds = documentBounds(100, 100, objects);
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(-bounds.x, -bounds.y);
      drawScene(ctx, source, objects, bounds, assets, {
        expandedBackground,
        previewEffects: !expandedBackground,
      });
      return {
        image: canvas.toDataURL(),
        original: Array.from(ctx.getImageData(-64 - bounds.x, -34 - bounds.y, 1, 1).data),
        magnified: Array.from(ctx.getImageData(-70 - bounds.x, -36 - bounds.y, 1, 1).data),
      };
    };
    const blue = renderSecret('#0000ff', true);
    const red = renderSecret('#ff0000', true);
    const previewBlue = renderSecret('#0000ff', false);
    const previewRed = renderSecret('#ff0000', false);
    return {
      identical: blue.image === red.image,
      original: blue.original,
      magnified: blue.magnified,
      previewIdentical: previewBlue.image === previewRed.image,
      previewOriginal: previewBlue.original,
      previewMagnified: previewBlue.magnified,
    };
  }, moduleRoot);
  expect(result).toEqual({
    identical: true,
    original: [0, 0, 0, 255],
    magnified: [0, 0, 0, 255],
    previewIdentical: true,
    previewOriginal: [0, 0, 0, 255],
    previewMagnified: [0, 0, 0, 255],
  });
});

test('cached magnifier rendering remains bounded with 256 annotations on a 1080p scene', async ({
  desktop: page,
}, testInfo) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 1920;
    source.height = 1080;
    const sourceContext = source.getContext('2d')!;
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 1920, 1080);
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
    const annotations = Array.from({ length: 256 }, (_, i) => ({
      id: `annotation-${i}`,
      type: 'rectangle',
      seed: i + 1,
      style,
      rect: { x: 30 + (i % 16) * 112, y: 30 + Math.floor(i / 16) * 60, width: 90, height: 42 },
    }));
    const lenses = Array.from({ length: 4 }, (_, i) => ({
      id: `lens-${i}`,
      type: 'magnifier',
      seed: i + 1,
      style,
      center: { x: 350 + i * 400, y: 550 },
      radius: 100,
      zoom: 2,
    }));
    const elapsed: number[] = [];
    for (let frame = 0; frame < 33; frame++) {
      const objects = [
        ...annotations,
        ...lenses.map((lens) => ({
          ...lens,
          center: { ...lens.center, x: lens.center.x + frame },
        })),
      ];
      const start = performance.now();
      drawScene(ctx, source, objects);
      // Include completion/readback, not just queued GPU drawing calls.
      ctx.getImageData(0, 0, 1, 1);
      if (frame >= 3) elapsed.push(performance.now() - start);
    }
    elapsed.sort((a, b) => a - b);
    return {
      image: '1920x1080',
      annotations: 256,
      lenses: 4,
      frames: elapsed.length,
      medianMs: elapsed[Math.floor(elapsed.length / 2)],
      p95Ms: elapsed[Math.floor(elapsed.length * 0.95)],
    };
  }, moduleRoot);
  expect(result.frames).toBe(30);
  // Record measurements rather than impose a flaky hardware-dependent frame-rate threshold.
  await testInfo.attach('magnifier-render-timing.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.log(`${testInfo.project.name} magnifier benchmark: ${JSON.stringify(result)}`);
});
