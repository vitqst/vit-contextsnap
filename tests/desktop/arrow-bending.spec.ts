import type { Page } from '@playwright/test';
import { test, expect, capture, calls, drag } from './bridge';

async function exportedArrow(page: Page) {
  const before = (await calls(page, 'save_png')).length;
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(before + 1);
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  return page.evaluate(async () => {
    const saved = window.__desktopTest.calls.filter((call) => call.command === 'save_png').at(-1)!;
    const bytes = saved.args.png as number[];
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const redNear = (x: number, y: number) => {
        const pixels = context.getImageData(x - 4, y - 4, 8, 8).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i]! > 180 && pixels[i + 1]! < 140 && pixels[i + 2]! < 140) count++;
        }
        return count;
      };
      return {
        bytes,
        start: redNear(180, 180),
        end: redNear(720, 180),
        straight: redNear(450, 180),
        bent: redNear(450, 240),
        nextArrow: redNear(450, 360),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

test('arrows start straight, bend from their middle handle, and undo without moving their endpoints', async ({
  desktop: page,
}) => {
  await capture(page);
  await expect(page.getByRole('group', { name: 'Arrow mode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Straight', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Curved', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Actual pixels', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  await page.getByRole('slider', { name: /Thickness/ }).fill('8');
  await drag(page, { x: 180, y: 180 }, { x: 720, y: 180 });
  const label = page.getByRole('textbox', { name: 'Arrow label', exact: true });
  await label.fill('Keep this label');
  const straight = await exportedArrow(page);
  expect(straight.straight).toBeGreaterThan(0);
  expect(straight.bent).toBe(0);

  await drag(page, { x: 450, y: 180 }, { x: 450, y: 240 });
  const bent = await exportedArrow(page);
  expect(bent.start).toBeGreaterThan(0);
  expect(bent.end).toBeGreaterThan(0);
  expect(bent.straight).toBe(0);
  expect(bent.bent).toBeGreaterThan(0);
  await expect(label).toHaveValue('Keep this label');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await exportedArrow(page)).bytes).toEqual(straight.bytes);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await exportedArrow(page)).bytes).toEqual(bent.bytes);

  // Bending one arrow must not make subsequently drawn arrows curved by default.
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await drag(page, { x: 180, y: 360 }, { x: 720, y: 360 });
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect((await exportedArrow(page)).nextArrow).toBeGreaterThan(0);
});
