import type { Page } from '@playwright/test';
import { test, expect, capture, drag } from './bridge';

async function bitmap(page: Page): Promise<string> {
  return page.getByTestId('drawing-canvas').evaluate(async (canvas) => {
    const bytes = new TextEncoder().encode((canvas as HTMLCanvasElement).toDataURL());
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

async function startText(page: Page, text: string) {
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await drag(page, { x: 300, y: 150 }, { x: 300, y: 150 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill(text);
  return input;
}

async function exportedPadding(page: Page, command: 'save_png' | 'copy_png') {
  return page.evaluate(async (name) => {
    const call = window.__desktopTest.calls.filter((item) => item.command === name).at(-1)!;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(call.args.png as number[])], { type: 'image/png' }),
    );
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(295, 155, 1, 1).data);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, command);
}

test('text card background defaults off, has its own color, and survives copy, save and undo', async ({
  desktop: page,
}) => {
  await capture(page);
  const input = await startText(page, 'Text on a card');
  await input.press('Control+Enter');
  const toggle = page.getByRole('checkbox', { name: 'Card background', exact: true });
  await expect(toggle).not.toBeChecked();
  const color = page.getByLabel('Card color', { exact: true });
  await expect(color).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  const plain = await bitmap(page);
  await toggle.check();
  await expect(color).toHaveValue('#ffffff');
  await color.fill('#ffe58f');
  await expect.poll(() => bitmap(page)).not.toBe(plain);
  const card = await bitmap(page);
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  expect(await exportedPadding(page, 'save_png')).toEqual([255, 229, 143, 255]);
  await page.getByRole('button', { name: /^Copy image/ }).click();
  await expect(page.getByRole('status')).toHaveText('Image copied. Ready to paste.');
  expect(await exportedPadding(page, 'copy_png')).toEqual([255, 229, 143, 255]);
  await toggle.uncheck();
  await expect.poll(() => bitmap(page)).toBe(plain);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(color).toHaveValue('#ffe58f');
  await expect.poll(() => bitmap(page)).toBe(card);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(() => bitmap(page)).toBe(plain);
});

test('enabling a card preserves a live Vietnamese text draft and keeps new text transparent', async ({
  desktop: page,
}) => {
  await capture(page);
  const message = 'Ghi chú tiếng Việt đang viết';
  const input = await startText(page, message);
  const before = (await input.boundingBox())!;
  await page.getByRole('checkbox', { name: 'Card background', exact: true }).check();
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('slider', { name: 'Font size', exact: true })).toHaveValue('24');
  const bg = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.dblclick(bg.x + (310 / 960) * bg.width, bg.y + (165 / 640) * bg.height);
  await expect(input).toHaveValue(message);
  await expect.poll(async () => (await input.boundingBox())!.width).toBe(before.width);
  await input.fill(Array.from({ length: 9 }, (_, index) => `Dòng ${index + 1}`).join('\n'));
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(before.height);
  const live = await bitmap(page);
  await input.press('Control+Enter');
  await expect.poll(() => bitmap(page)).toBe(live);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await drag(page, { x: 610, y: 150 }, { x: 610, y: 150 });
  await input.fill('Another text');
  await expect(
    page.getByRole('checkbox', { name: 'Card background', exact: true }),
  ).not.toBeChecked();
});

test('text card side handles resize wrapping without changing the text origin or font', async ({
  desktop: page,
}) => {
  await capture(page);
  const input = await startText(page, 'Hi');
  const before = (await input.boundingBox())!;
  await input.press('Control+Enter');
  await page.getByRole('checkbox', { name: 'Card background', exact: true }).check();
  await drag(page, { x: 532, y: 166 }, { x: 452, y: 166 });
  const bg = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.dblclick(bg.x + (310 / 960) * bg.width, bg.y + (165 / 640) * bg.height);
  await expect(input).toHaveValue('Hi');
  const resized = (await input.boundingBox())!;
  expect(resized.x).toBeCloseTo(before.x, 1);
  expect(resized.y).toBeCloseTo(before.y, 1);
  // WebKit rounds native pointer coordinates; allow one viewport pixel, not
  // the fractional precision available from the core geometry unit tests.
  expect(Math.abs(resized.width - (before.width * 140) / 220)).toBeLessThan(1);
  await expect(page.getByRole('slider', { name: 'Font size', exact: true })).toHaveValue('24');
});
