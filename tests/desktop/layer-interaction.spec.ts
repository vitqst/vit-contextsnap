import type { Page } from '@playwright/test';
import { test, expect, capture, drag, calls } from './bridge';

const IMAGE_PIXEL = [220, 38, 127, 255];
const ARROW_PIXEL = [224, 82, 82, 255];

async function addImage(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 120;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#dc267f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Add image file', { exact: true }).setInputFiles({
    name: 'layer-order.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByRole('status')).toHaveText(
    'Image added. Drag to move; use a corner to resize.',
  );
}

async function addArrow(page: Page) {
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  await page.getByRole('slider', { name: 'Thickness' }).press('End');
  await drag(page, { x: 280, y: 320 }, { x: 680, y: 320 });
}

async function exportedOverlap(page: Page) {
  const previous = (await calls(page, 'save_png')).length;
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(previous + 1);
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  return page.evaluate(async () => {
    const saved = window.__desktopTest.calls.filter((call) => call.command === 'save_png').at(-1)!;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(saved.args.png as number[])], { type: 'image/png' }),
    );
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(480, 320, 1, 1).data);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

async function selectOverlap(page: Page, type: 'Arrow' | 'Image') {
  await page.keyboard.press('Escape');
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(
    page.getByRole('complementary', { name: 'Drawing properties' }).locator('.property-heading'),
  ).toHaveText(new RegExp(`^${type}\\s*Selected$`));
}

test('new arrows appear above inserted images and layer controls cross types with undo and redo', async ({
  desktop: page,
}) => {
  await capture(page);
  await addImage(page);
  await addArrow(page);
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect(await exportedOverlap(page)).toEqual(ARROW_PIXEL);
  await selectOverlap(page, 'Arrow');
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Send backward', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(IMAGE_PIXEL);
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send backward', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(ARROW_PIXEL);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(IMAGE_PIXEL);
  await selectOverlap(page, 'Image');
  await page.getByRole('button', { name: 'Send backward', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(ARROW_PIXEL);
  await selectOverlap(page, 'Arrow');
});

test('new inserted images appear above arrows and can move backward and forward through them', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await addImage(page);
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect(await exportedOverlap(page)).toEqual(IMAGE_PIXEL);
  await selectOverlap(page, 'Image');
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Send backward', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(ARROW_PIXEL);
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send backward', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Bring forward', exact: true }).click();
  expect(await exportedOverlap(page)).toEqual(IMAGE_PIXEL);
  await selectOverlap(page, 'Image');
});
