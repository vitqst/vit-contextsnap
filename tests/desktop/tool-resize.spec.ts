import type { Page } from '@playwright/test';
import { test, expect, capture, drag, calls } from './bridge';

async function dimensions(page: Page) {
  const previous = (await calls(page, 'save_png')).length;
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(previous + 1);
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  const saved = (await calls(page, 'save_png')).at(-1)!;
  const header = new DataView(new Uint8Array(saved.args.png as number[]).buffer);
  return { width: header.getUint32(16), height: header.getUint32(20) };
}

async function start(page: Page) {
  await capture(page);
  await page.getByRole('button', { name: 'Actual pixels', exact: true }).click();
}

async function crop(page: Page) {
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 200, y: 150 }, { x: 600, y: 450 });
  await expect(page.getByTestId('object-count')).toContainText('Cropped to 400 × 300');
}

test('crop corners and edges resize the existing crop with one undo per gesture', async ({
  desktop: page,
}) => {
  await start(page);
  await crop(page);
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 600, y: 450 }, { x: 720, y: 520 });
  expect(await dimensions(page)).toEqual({ width: 520, height: 370 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await dimensions(page)).toEqual({ width: 400, height: 300 });
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await dimensions(page)).toEqual({ width: 520, height: 370 });

  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 460, y: 150 }, { x: 500, y: 100 });
  expect(await dimensions(page)).toEqual({ width: 520, height: 420 });
});

test('crop body moves without resizing, Escape restores it, and outside drawing replaces it', async ({
  desktop: page,
}) => {
  await start(page);
  await crop(page);
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 500, y: 380 });
  expect(await dimensions(page)).toEqual({ width: 400, height: 300 });

  const box = (await page.locator('.screenshot-background').boundingBox())!;
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await page.mouse.move(box.x + (700 / 960) * box.width, box.y + (530 / 640) * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + (750 / 960) * box.width, box.y + (570 / 640) * box.height, {
    steps: 8,
  });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await dimensions(page)).toEqual({ width: 400, height: 300 });

  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 100, y: 100 }, { x: 250, y: 200 });
  expect(await dimensions(page)).toEqual({ width: 150, height: 100 });
});

test('magnifier drag handles resize while retaining center, magnification and undo history', async ({
  desktop: page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 472, y: 300 });
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('72');
  await drag(page, { x: 472, y: 300 }, { x: 530, y: 300 });
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('130');
  await expect(page.getByRole('slider', { name: 'Magnification' })).toHaveValue('2');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('72');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('130');
  // The opposite handle is still relative to the original center, not a moved lens.
  await drag(page, { x: 270, y: 300 }, { x: 220, y: 300 });
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('180');
});

test('resize handles use world coordinates after zooming and panning', async ({
  desktop: page,
}) => {
  await start(page);
  await crop(page);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.mouse.move(800, 600);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(850, 630, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await drag(page, { x: 600, y: 450 }, { x: 720, y: 510 });
  const resized = await dimensions(page);
  expect(Math.abs(resized.width - 520)).toBeLessThanOrEqual(1);
  expect(Math.abs(resized.height - 360)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: 'Reset crop', exact: true }).click();
  await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 472, y: 300 });
  await drag(page, { x: 472, y: 300 }, { x: 520, y: 300 });
  await expect
    .poll(async () =>
      Math.abs(Number(await page.getByRole('slider', { name: 'Lens size' }).inputValue()) - 120),
    )
    .toBeLessThan(2);
});

test('pointer cancellation restores the previous crop and magnifier size', async ({
  desktop: page,
}) => {
  await start(page);
  await crop(page);
  const canvas = page.getByTestId('drawing-canvas');
  async function cancelDrag(from: { x: number; y: number }, to: { x: number; y: number }) {
    const box = (await page.locator('.screenshot-background').boundingBox())!;
    await canvas.evaluate((element) => {
      element.addEventListener(
        'pointerdown',
        (event) => {
          (element as HTMLElement).dataset.testPointerId = String(
            (event as PointerEvent).pointerId,
          );
        },
        { once: true },
      );
    });
    await page.mouse.move(box.x + (from.x / 960) * box.width, box.y + (from.y / 640) * box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + (to.x / 960) * box.width, box.y + (to.y / 640) * box.height, {
      steps: 8,
    });
    await canvas.evaluate((element) => {
      element.dispatchEvent(
        new PointerEvent('pointercancel', {
          pointerId: Number((element as HTMLElement).dataset.testPointerId),
          bubbles: true,
        }),
      );
    });
    await page.mouse.up();
  }
  await cancelDrag({ x: 600, y: 450 }, { x: 700, y: 550 });
  expect(await dimensions(page)).toEqual({ width: 400, height: 300 });
  await page.getByRole('button', { name: 'Reset crop', exact: true }).click();
  await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 472, y: 300 });
  await cancelDrag({ x: 472, y: 300 }, { x: 530, y: 300 });
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('72');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
});

test('a small magnifier keeps a draggable center when zoomed far out', async ({
  desktop: page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 432, y: 300 });
  for (let index = 0; index < 8; index++)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await drag(page, { x: 400, y: 300 }, { x: 450, y: 300 });
  await expect(page.getByRole('slider', { name: 'Lens size' })).toHaveValue('32');
});

test('a crop outside the screenshot remains resizable after expanded objects are deleted', async ({
  desktop: page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await drag(page, { x: 1040, y: 200 }, { x: 1140, y: 400 });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 1000, y: 220 }, { x: 1120, y: 380 });
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  const box = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.click(box.x + (1140 / 960) * box.width, box.y + (300 / 640) * box.height);
  await page.getByRole('button', { name: 'Delete object', exact: true }).click();
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-world-width', '960');
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await drag(page, { x: 1000, y: 300 }, { x: 980, y: 300 });
  const resized = await dimensions(page);
  expect(Math.abs(resized.width - 140)).toBeLessThanOrEqual(2);
  expect(Math.abs(resized.height - 160)).toBeLessThanOrEqual(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
