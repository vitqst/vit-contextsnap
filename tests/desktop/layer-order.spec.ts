import { test, expect } from './bridge';

const moduleRoot = `/@fs${process.cwd()}/src`;

for (const [preview, protectedScene] of [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
]) {
  test(`${preview ? 'preview' : 'export'} paints and reorders images across drawing layers${protectedScene ? ' with protected redactions' : ''}`, async ({
    desktop: page,
  }) => {
    const result = await page.evaluate(
      async ({ root, preview, protectedScene }) => {
        const { drawScene } = await import(`${root}/editor/render.ts`);
        const { reorderObject, objectsInPaintOrder } = await import(`${root}/core/layers.ts`);
        const { hitTestObject } = await import(`${root}/core/geometry.ts`);
        const source = document.createElement('canvas');
        source.width = source.height = 200;
        const sourceCtx = source.getContext('2d')!;
        sourceCtx.fillStyle = '#ffffff';
        sourceCtx.fillRect(0, 0, 200, 200);
        const stamp = document.createElement('canvas');
        stamp.width = stamp.height = 100;
        const stampCtx = stamp.getContext('2d')!;
        stampCtx.fillStyle = '#0000ff';
        stampCtx.fillRect(0, 0, 100, 100);
        const style = { color: '#ff0000', width: 8, sketch: false, shadow: false };
        const arrow = {
          id: 'arrow',
          seed: 1,
          type: 'arrow',
          style,
          start: { x: 20, y: 100 },
          end: { x: 180, y: 100 },
          control: { x: 100, y: 100 },
          mode: 'straight',
          label: '',
          labelOffset: { x: 0, y: 0 },
        };
        const image = {
          id: 'image',
          seed: 2,
          type: 'image',
          style,
          assetId: 'stamp',
          rect: { x: 50, y: 50, width: 100, height: 100 },
        };
        const assets = new Map([
          ['stamp', { id: 'stamp', source: stamp, width: 100, height: 100 }],
        ]);
        const render = (objects: unknown[]) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 200;
          const ctx = canvas.getContext('2d')!;
          const scale = preview ? 0.57 : 1;
          ctx.scale(scale, scale);
          const painted = protectedScene
            ? [
                ...objects,
                {
                  id: 'mask',
                  seed: 3,
                  type: 'redact',
                  style,
                  rect: { x: 5, y: 5, width: 10, height: 10 },
                },
              ]
            : objects;
          drawScene(ctx, source, painted, undefined, assets, { expandedBackground: !preview });
          return {
            pixel: [
              ...ctx.getImageData(Math.floor(100 * scale), Math.floor(100 * scale), 1, 1).data,
            ],
            top: objectsInPaintOrder(objects)
              .reverse()
              .find((object: unknown) => hitTestObject(object, { x: 100, y: 100 }, 0))?.id,
          };
        };
        const original = [arrow, image];
        const backward = reorderObject(original, 'image', 'backward');
        return {
          original: render(original),
          backward: render(backward),
          forward: render(reorderObject(backward, 'image', 'forward')),
        };
      },
      { root: moduleRoot, preview, protectedScene },
    );
    expect(result).toEqual({
      original: { pixel: [0, 0, 255, 255], top: 'image' },
      backward: { pixel: [255, 0, 0, 255], top: 'arrow' },
      forward: { pixel: [0, 0, 255, 255], top: 'image' },
    });
  });
}

test('magnifiers sample only layers underneath them and moving an image invalidates that source', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 200;
    const sourceCtx = source.getContext('2d')!;
    sourceCtx.fillStyle = '#ffffff';
    sourceCtx.fillRect(0, 0, 200, 200);
    const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
    const rectangle = {
      id: 'rectangle',
      seed: 1,
      type: 'rectangle',
      style,
      rect: { x: 90, y: 70, width: 20, height: 60 },
    };
    const lens = {
      id: 'lens',
      seed: 2,
      type: 'magnifier',
      style,
      center: { x: 100, y: 100 },
      radius: 50,
      zoom: 2,
    };
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 20;
    const stampCtx = stamp.getContext('2d')!;
    stampCtx.fillStyle = '#0000ff';
    stampCtx.fillRect(0, 0, 20, 20);
    const image = {
      id: 'image',
      seed: 3,
      type: 'image',
      style,
      assetId: 'stamp',
      rect: { x: 80, y: 90, width: 20, height: 20 },
    };
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 20, height: 20 }]]);
    const render = (objects: unknown[]) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 200;
      const ctx = canvas.getContext('2d')!;
      drawScene(ctx, source, objects, undefined, assets);
      return [...ctx.getImageData(80, 100, 1, 1).data];
    };
    return {
      below: render([rectangle, lens]),
      above: render([lens, rectangle]),
      imageBelow: render([image, lens]),
      imageMoved: render([{ ...image, rect: { ...image.rect, x: 150 } }, lens]),
      imageAbove: render([lens, image]),
    };
  }, moduleRoot);
  expect(result).toEqual({
    below: [255, 0, 0, 255],
    above: [255, 255, 255, 255],
    imageBelow: [0, 0, 255, 255],
    imageMoved: [255, 255, 255, 255],
    imageAbove: [0, 0, 255, 255],
  });
});
