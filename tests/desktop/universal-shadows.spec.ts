import { test, expect } from './bridge';

test('cropping without redactions does not rebuild pen geometry for shadow checks', async ({
  desktop: page,
}) => {
  const counts = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 320;
    source.height = 240;
    const output = document.createElement('canvas');
    output.width = 320;
    output.height = 240;
    let pointTraversals = 0;
    const points = Array.from({ length: 256 }, (_, index) => ({
      x: 30 + index,
      y: 100 + Math.sin(index / 12) * 30,
      pressure: 0.5,
    }));
    // Count actual outline input traversals without replacing the renderer or
    // geometry calculations. Warm-up removes the immutable extent-cache cost.
    const tracedPoints = new Proxy(points, {
      get(target, property, receiver) {
        if (property === 'map') pointTraversals++;
        return Reflect.get(target, property, receiver);
      },
    });
    const pen = {
      id: 'pen',
      type: 'pen',
      seed: 1,
      points: tracedPoints,
      style: { color: '#e05252', width: 4, sketch: false, shadow: true },
    };
    const ctx = output.getContext('2d')!;
    drawScene(ctx, source, [pen]);
    pointTraversals = 0;
    for (let frame = 0; frame < 3; frame++) drawScene(ctx, source, [pen]);
    const uncropped = pointTraversals;
    pointTraversals = 0;
    const crop = { x: 10, y: 10, width: 300, height: 220 };
    for (let frame = 0; frame < 3; frame++) drawScene(ctx, source, [pen], crop);
    return { uncropped, cropped: pointTraversals };
  }, `/@fs${process.cwd()}/src`);
  expect(counts.uncropped).toBeGreaterThan(0);
  expect(counts.cropped).toBe(counts.uncropped);
});

test('all drawing objects and attached labels render configurable soft and hard shadows', async ({
  desktop: page,
}) => {
  const results = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 320;
    source.height = 260;
    const background = source.getContext('2d')!;
    background.fillStyle = '#ffffff';
    background.fillRect(0, 0, 320, 260);
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 80;
    const ink = stamp.getContext('2d')!;
    ink.fillStyle = '#e05252';
    ink.fillRect(0, 0, 80, 80);
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 80, height: 80 }]]);
    const base = { id: 'object', seed: 1, style: { color: '#e05252', width: 4, sketch: false } };
    const rect = { x: 100, y: 90, width: 90, height: 70 };
    const objects = [
      {
        ...base,
        type: 'arrow',
        start: { x: 100, y: 120 },
        end: { x: 190, y: 120 },
        control: { x: 145, y: 120 },
        label: '',
        labelOffset: { x: 0, y: 0 },
      },
      {
        ...base,
        type: 'pen',
        points: [
          { x: 100, y: 120, pressure: 0.5 },
          { x: 190, y: 120, pressure: 0.5 },
        ],
      },
      { ...base, type: 'rectangle', rect },
      { ...base, type: 'text', position: { x: 100, y: 100 }, text: 'Text', fontSize: 32 },
      { ...base, type: 'sticky', rect, text: 'Note', fontSize: 20 },
      { ...base, type: 'step', center: { x: 145, y: 125 }, radius: 28, number: 1 },
      { ...base, type: 'image', rect, assetId: 'stamp' },
      { ...base, type: 'magnifier', center: { x: 145, y: 125 }, radius: 35, zoom: 2 },
      { ...base, type: 'blur', rect, strength: 12 },
      { ...base, type: 'redact', rect },
      {
        ...base,
        type: 'rectangle',
        rect: { x: 100, y: 150, width: 90, height: 20 },
        note: 'Label',
        labelPosition: 'top',
      },
    ];
    const output = document.createElement('canvas');
    output.width = 320;
    output.height = 260;
    const ctx = output.getContext('2d')!;
    const render = (object: unknown) => {
      drawScene(ctx, source, [object], undefined, assets);
      return ctx.getImageData(0, 0, 320, 260).data;
    };
    const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray, labelOnly = false) => {
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        const y = Math.floor(i / 4 / 320);
        if (labelOnly && y >= 140) continue;
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) count++;
      }
      return count;
    };
    return objects.map((object, index) => {
      const off = render({ ...object, style: { ...base.style, shadow: false } });
      const soft = render({
        ...object,
        style: { ...base.style, shadow: true, shadowKind: 'soft' },
      });
      const hard = render({
        ...object,
        style: { ...base.style, shadow: true, shadowKind: 'hard' },
      });
      return {
        type: index === objects.length - 1 ? 'label' : object.type,
        soft: difference(off, soft, index === objects.length - 1),
        hard: difference(off, hard, index === objects.length - 1),
        modes: difference(soft, hard),
      };
    });
  }, `/@fs${process.cwd()}/src`);
  for (const result of results) {
    expect(result.soft, `${result.type}: soft shadow changes actual pixels`).toBeGreaterThan(10);
    expect(result.hard, `${result.type}: hard shadow changes actual pixels`).toBeGreaterThan(10);
    expect(result.modes, `${result.type}: hard and soft are visually distinct`).toBeGreaterThan(10);
  }
});

test('shadowed privacy effects never reveal a secret through blur, lenses, or fractional previews', async ({
  desktop: page,
}) => {
  const results = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const makeSource = (color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = color;
      ctx.fillRect(80, 70, 81, 61);
      return canvas;
    };
    const red = makeSource('#ff0000');
    const blue = makeSource('#0000ff');
    const result = [];
    for (const shadowKind of ['soft', 'hard']) {
      for (const previewEffects of [false, true]) {
        for (const lens of [false, true]) {
          const base = {
            seed: 1,
            style: { color: '#e05252', width: 4, sketch: false, shadow: true, shadowKind },
          };
          const objects = [
            {
              ...base,
              id: 'blur',
              type: 'blur',
              rect: { x: 50, y: 50, width: 160, height: 120 },
              strength: 12,
            },
            {
              ...base,
              id: 'redact',
              type: 'redact',
              rect: { x: 80.25, y: 70.5, width: 80, height: 60 },
            },
            ...(lens
              ? [
                  {
                    ...base,
                    id: 'lens',
                    type: 'magnifier',
                    center: { x: 115, y: 100 },
                    radius: 70,
                    zoom: 2,
                  },
                ]
              : []),
          ];
          const render = (source: HTMLCanvasElement) => {
            const output = document.createElement('canvas');
            output.width = 200;
            output.height = 160;
            const ctx = output.getContext('2d')!;
            ctx.scale(0.57, 0.57);
            drawScene(ctx, source, objects, undefined, undefined, {
              expandedBackground: false,
              previewEffects,
            });
            return {
              pixels: ctx.getImageData(0, 0, 200, 160).data,
              black: [...ctx.getImageData(57, 51, 1, 1).data],
            };
          };
          const first = render(red);
          const second = render(blue);
          let changed = 0;
          for (let index = 0; index < first.pixels.length; index++)
            if (first.pixels[index] !== second.pixels[index]) changed++;
          result.push({ shadowKind, previewEffects, lens, changed, black: second.black });
        }
      }
    }
    return result;
  }, `/@fs${process.cwd()}/src`);
  for (const result of results) {
    expect(result.changed, JSON.stringify(result)).toBe(0);
    expect(result.black).toEqual([0, 0, 0, 255]);
  }
});

test('image shadows extend exports and effect caches invalidate shadow-only changes', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { flattenImage, loadImage } = await import(`${root}/export/image.ts`);
    const { getEffectSource } = await import(`${root}/editor/render-effects.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 100;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);
    const png = await new Promise<Blob>((resolve) =>
      source.toBlob((blob) => resolve(blob!), 'image/png'),
    );
    const image = await loadImage(png);
    const assets = new Map([['image', { id: 'image', source, width: 100, height: 100 }]]);
    const base = {
      id: 'object',
      seed: 1,
      style: { color: '#e05252', width: 4, sketch: false, shadow: true },
    };
    const object = {
      ...base,
      type: 'image',
      assetId: 'image',
      rect: { x: 90, y: 90, width: 60, height: 60 },
    };
    const dimensions = [];
    for (const shadowKind of ['soft', 'hard']) {
      const blob = await flattenImage(
        image,
        { version: 1, crop: null, objects: [{ ...object, style: { ...base.style, shadowKind } }] },
        assets,
      );
      const exported = await loadImage(blob);
      dimensions.push([exported.naturalWidth, exported.naturalHeight]);
    }
    const mask = { ...base, type: 'redact', rect: { x: 20, y: 20, width: 40, height: 40 } };
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const pixels = (shadowKind: string) => {
      const canvas = getEffectSource(
        source,
        [{ ...mask, style: { ...base.style, shadowKind } }],
        undefined,
        bounds,
      );
      return (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 100, 100).data;
    };
    const soft = pixels('soft');
    const hard = pixels('hard');
    const softAgain = pixels('soft');
    let modeChanges = 0;
    let repeatChanges = 0;
    for (let index = 0; index < soft.length; index++) {
      if (soft[index] !== hard[index]) modeChanges++;
      if (soft[index] !== softAgain[index]) repeatChanges++;
    }
    return { dimensions, modeChanges, repeatChanges };
  }, `/@fs${process.cwd()}/src`);
  expect(result.dimensions).toEqual([
    [160, 162],
    [153, 153],
  ]);
  expect(result.modeChanges).toBeGreaterThan(10);
  expect(result.repeatChanges).toBe(0);
});

test('image shadow silhouettes cannot leak the alpha of a redacted private glyph', async ({
  desktop: page,
}) => {
  const results = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 200;
    const background = source.getContext('2d')!;
    background.fillStyle = '#ffffff';
    background.fillRect(0, 0, 200, 200);
    const secret = (visible: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      if (visible) {
        const ink = canvas.getContext('2d')!;
        ink.fillStyle = '#000000';
        ink.fillRect(35, 35, 10, 30);
      }
      return new Map([['secret', { id: 'secret', source: canvas, width: 100, height: 100 }]]);
    };
    const opaque = secret(true);
    const transparent = secret(false);
    return ['soft', 'hard'].map((shadowKind) => {
      const base = {
        seed: 1,
        style: { color: '#e05252', width: 4, sketch: false, shadow: true, shadowKind },
      };
      const objects = [
        {
          ...base,
          id: 'image',
          type: 'image',
          assetId: 'secret',
          rect: { x: 50, y: 50, width: 100, height: 100 },
        },
        { ...base, id: 'redact', type: 'redact', rect: { x: 85, y: 85, width: 10, height: 30 } },
      ];
      const render = (assets: typeof opaque) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 200;
        const ctx = canvas.getContext('2d')!;
        drawScene(ctx, source, objects, undefined, assets);
        return ctx.getImageData(0, 0, 200, 200).data;
      };
      const first = render(opaque);
      const second = render(transparent);
      let changed = 0;
      for (let index = 0; index < first.length; index++)
        if (first[index] !== second[index]) changed++;
      return { shadowKind, changed };
    });
  }, `/@fs${process.cwd()}/src`);
  for (const result of results) expect(result.changed, result.shadowKind).toBe(0);
});

test('redaction suppresses glyph-derived shadows from covered annotation text', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = 300;
    source.height = 160;
    const background = source.getContext('2d')!;
    background.fillStyle = '#ffffff';
    background.fillRect(0, 0, 300, 160);
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    const base = { seed: 1, style: { color: '#e05252', width: 4, sketch: false, shadow: false } };
    const text = {
      ...base,
      id: 'text',
      type: 'text',
      position: { x: 60, y: 60 },
      text: 'Secret',
      fontSize: 32,
    };
    drawScene(ctx, source, [text]);
    const original = ctx.getImageData(0, 0, 300, 160).data;
    let left = 300,
      top = 160,
      right = 0,
      bottom = 0;
    for (let y = 0; y < 160; y++)
      for (let x = 0; x < 300; x++) {
        const index = (y * 300 + x) * 4;
        if (original[index]! < 255 || original[index + 1]! < 255 || original[index + 2]! < 255) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + 1);
          bottom = Math.max(bottom, y + 1);
        }
      }
    const mask = {
      ...base,
      id: 'redact',
      type: 'redact',
      rect: { x: left, y: top, width: right - left, height: bottom - top },
    };
    return ['soft', 'hard'].map((shadowKind) => {
      const pixels = (value: string) => {
        drawScene(ctx, source, [
          { ...text, text: value, style: { ...base.style, shadow: true, shadowKind } },
          mask,
        ]);
        return ctx.getImageData(0, 0, 300, 160).data;
      };
      const secret = pixels('Secret');
      const empty = pixels('');
      let changed = 0;
      for (let index = 0; index < secret.length; index++)
        if (secret[index] !== empty[index]) changed++;
      return { shadowKind, changed };
    });
  }, `/@fs${process.cwd()}/src`);
  for (const item of result) expect(item.changed, item.shadowKind).toBe(0);
});
