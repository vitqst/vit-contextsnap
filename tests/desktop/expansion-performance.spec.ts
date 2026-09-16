import { test, expect, capture, addArrow } from './bridge';

test('moving an image layer previews directly without reallocating expanded scene bitmaps', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const source = document.createElement('canvas');
    source.width = source.height = 100;
    const stamp = document.createElement('canvas');
    stamp.width = stamp.height = 32;
    const ink = stamp.getContext('2d')!;
    ink.fillStyle = '#2563eb';
    ink.fillRect(0, 0, 32, 32);
    const assets = new Map([['stamp', { id: 'stamp', source: stamp, width: 32, height: 32 }]]);
    const output = document.createElement('canvas');
    output.width = output.height = 128;
    const ctx = output.getContext('2d')!;
    const descriptors = ['width', 'height'].map((key) => ({
      key,
      descriptor: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key)!,
    }));
    let dimensionWrites = 0;
    for (const { key, descriptor } of descriptors) {
      Object.defineProperty(HTMLCanvasElement.prototype, key, {
        ...descriptor,
        set(value: number) {
          dimensionWrites++;
          descriptor.set!.call(this, value);
        },
      });
    }
    try {
      for (const x of [100, 200, 300, 400, 500]) {
        ctx.setTransform(1, 0, 0, 1, 20 - x, 0);
        drawScene(
          ctx,
          source,
          [
            {
              id: 'image',
              type: 'image',
              seed: 1,
              style: { color: '#ff0000', width: 4, sketch: false },
              assetId: 'stamp',
              rect: { x, y: 20, width: 32, height: 32 },
            },
          ],
          undefined,
          assets,
          { expandedBackground: false },
        );
      }
      return { dimensionWrites, pixel: [...ctx.getImageData(30, 30, 1, 1).data] };
    } finally {
      for (const { key, descriptor } of descriptors)
        Object.defineProperty(HTMLCanvasElement.prototype, key, descriptor);
    }
  }, `/@fs${process.cwd()}/src`);
  expect(result.pixel).toEqual([37, 99, 235, 255]);
  expect(result.dimensionWrites).toBe(0);
});

test('outward dragging never resizes or blanks the visible canvas', async ({ desktop: page }) => {
  await capture(page);
  await addArrow(page);
  const source = (await page.locator('.image-stage').boundingBox())!;
  const scale = source.width / 960;
  const sample = { x: source.x + 50 * scale, y: source.y + 45 * scale };
  await page.evaluate((point) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="drawing-canvas"]')!;
    const state = { dimensionWrites: 0, blankFrames: 0, frames: 0, running: true };
    const observer = new MutationObserver((changes) => {
      state.dimensionWrites += changes.length;
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
    const sampleFrame = () => {
      if (!state.running) return;
      const frame = canvas.getBoundingClientRect();
      const alpha = canvas
        .getContext('2d')!
        .getImageData(
          Math.floor(((point.x - frame.x) * canvas.width) / frame.width),
          Math.floor(((point.y - frame.y) * canvas.height) / frame.height),
          1,
          1,
        ).data[3];
      state.frames++;
      if (alpha === 0) state.blankFrames++;
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    Object.assign(window, { expansionProbe: { state, observer } });
  }, sample);
  await page.mouse.move(source.x + 390 * scale, source.y + 266 * scale);
  await page.mouse.down();
  await page.mouse.move(source.x - 90, source.y - 55, { steps: 40 });
  await page.mouse.up();
  const result = await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const probe = (
      window as unknown as {
        expansionProbe: {
          state: { running: boolean; frames: number; blankFrames: number; dimensionWrites: number };
          observer: MutationObserver;
        };
      }
    ).expansionProbe;
    probe.state.running = false;
    probe.observer.disconnect();
    return probe.state;
  });
  console.log('expansion preview probe:', result);
  expect(result.frames).toBeGreaterThan(5);
  expect(result.dimensionWrites, 'Dragging must not clear the backing bitmap by resizing it').toBe(
    0,
  );
  expect(result.blankFrames, 'Unchanged screenshot pixels stay visible throughout the drag').toBe(
    0,
  );
});

test('expanded workspace stays transparent while the PNG includes white extra space', async ({
  desktop: page,
}, testInfo) => {
  await capture(page);
  await addArrow(page);
  const initial = (await page.locator('.image-stage').boundingBox())!;
  const scale = initial.width / 960;
  await page.mouse.move(initial.x + 390 * scale, initial.y + 266 * scale);
  await page.mouse.down();
  await page.mouse.move(initial.x - 90, initial.y - 55, { steps: 20 });
  await page.mouse.up();
  const previewAlpha = () =>
    page.getByTestId('drawing-canvas').evaluate(
      (element, point) => {
        const canvas = element as HTMLCanvasElement;
        const frame = canvas.getBoundingClientRect();
        return canvas
          .getContext('2d')!
          .getImageData(
            Math.floor(((point.x - frame.x) * canvas.width) / frame.width),
            Math.floor(((point.y - frame.y) * canvas.height) / frame.height),
            1,
            1,
          ).data[3];
      },
      { x: initial.x - 50 * scale, y: initial.y + 500 * scale },
    );
  await expect.poll(previewAlpha).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('expanded-workspace.png') });
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  const result = await page.evaluate(async () => {
    const saved = window.__desktopTest.calls.find((call) => call.command === 'save_png')!;
    const png = new Blob([new Uint8Array(saved.args.png as number[])], { type: 'image/png' });
    const bitmap = await createImageBitmap(png);
    const output = document.createElement('canvas');
    output.width = bitmap.width;
    output.height = bitmap.height;
    const ctx = output.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const scene = document.querySelector('[data-testid="drawing-canvas"]')!;
    const x = Number(scene.getAttribute('data-world-x'));
    const y = Number(scene.getAttribute('data-world-y'));
    return {
      width: output.width,
      height: output.height,
      pixel: [...ctx.getImageData(-50 - x, 500 - y, 1, 1).data],
    };
  });
  expect(result.width).toBeGreaterThan(960);
  expect(result.height).toBeGreaterThan(640);
  expect(result.pixel).toEqual([255, 255, 255, 255]);
});
