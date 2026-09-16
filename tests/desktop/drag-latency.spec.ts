import type { Page } from '@playwright/test';
import { test, expect, capture } from './bridge';

async function openImageLayer(page: Page) {
  await capture(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 160, 100);
    return canvas.toDataURL().split(',')[1]!;
  });
  await page.getByLabel('Add image file', { exact: true }).setInputFiles({
    name: 'drag-latency.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
}

test('image drag paints the latest pointer position without a React-to-RAF frame delay', async ({
  desktop: page,
}) => {
  await openImageLayer(page);
  const frame = (await page.locator('.screenshot-background').boundingBox())!;
  const scale = frame.width / 960;
  const start = { x: frame.x + 480 * scale, y: frame.y + 320 * scale };
  await page.evaluate(
    ({ start, scale }) => {
      const state = { events: 0, paints: 0, stalePaints: 0, expectedX: 400, finalX: 400 };
      const move = (event: PointerEvent) => {
        if (event.buttons !== 1) return;
        state.events++;
        state.expectedX = 400 + (event.clientX - start.x) / scale;
      };
      window.addEventListener('pointermove', move, true);
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
        if (
          this.canvas.dataset.testid === 'drawing-canvas' &&
          state.events &&
          args.length === 5 &&
          args[3] === 160 &&
          args[4] === 100
        ) {
          state.paints++;
          state.finalX = Number(args[1]);
          if (Math.abs(state.finalX - state.expectedX) > 0.05) state.stalePaints++;
        }
        return Reflect.apply(draw, this, args);
      };
      Object.assign(window, {
        dragLatencyProbe: {
          state,
          cleanup() {
            CanvasRenderingContext2D.prototype.drawImage = draw;
            window.removeEventListener('pointermove', move, true);
          },
        },
      });
    },
    { start, scale },
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 160 * scale, start.y + 80 * scale, { steps: 24 });
  await page.mouse.up();
  const result = await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const probe = (
      window as unknown as {
        dragLatencyProbe: {
          state: { events: number; paints: number; stalePaints: number; finalX: number };
          cleanup(): void;
        };
      }
    ).dragLatencyProbe;
    probe.cleanup();
    return probe.state;
  });
  console.log('drag latency probe:', result);
  expect(result.events).toBeGreaterThan(10);
  // Coalescing several input events into one current frame is intentional.
  expect(result.paints).toBeGreaterThan(5);
  expect(result.finalX).toBeCloseTo(560, 1);
  expect(result.stalePaints, 'A rendered frame must not show the previous pointer position').toBe(
    0,
  );
});

test('live drag previews clear on cancel and history changes, and reject oversized drafts', async ({
  desktop: page,
}) => {
  await openImageLayer(page);
  await page.getByRole('button', { name: 'Actual pixels', exact: true }).click();
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  await expect
    .poll(async () => (await page.locator('.screenshot-background').boundingBox())!.width)
    .toBeCloseTo(960 / ratio, 3);
  await page.evaluate(() => {
    Object.assign(window, { dragImageX: 400 });
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: unknown[]) {
      if (
        this.canvas.dataset.testid === 'drawing-canvas' &&
        args.length === 5 &&
        args[3] === 160 &&
        args[4] === 100
      )
        Object.assign(window, { dragImageX: Number(args[1]) });
      return Reflect.apply(draw, this, args);
    };
  });
  const paintedX = () =>
    page.evaluate(() => (window as unknown as { dragImageX: number }).dragImageX);
  const frame = (await page.locator('.screenshot-background').boundingBox())!;
  const scale = frame.width / 960;
  const start = { x: frame.x + 480 * scale, y: frame.y + 320 * scale };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 100 * scale, start.y, { steps: 8 });
  await expect.poll(paintedX).toBeCloseTo(500, 1);
  await page.keyboard.press('Escape');
  await expect.poll(paintedX).toBeCloseTo(400, 1);
  await page.mouse.up();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80 * scale, start.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(paintedX).toBeCloseTo(480, 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(paintedX).toBeCloseTo(400, 1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(paintedX).toBeCloseTo(480, 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(paintedX).toBeCloseTo(400, 1);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20000, start.y);
  await expect(page.getByRole('alert')).toContainText('expanded canvas would exceed');
  await page.mouse.up();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await paintedX()).toBeCloseTo(400, 1);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-world-width', '960');
});
