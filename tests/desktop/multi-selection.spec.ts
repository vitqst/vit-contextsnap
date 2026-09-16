import type { Page } from '@playwright/test';
import { test, expect, capture, calls } from './bridge';

async function clickPoint(page: Page, x: number, y: number) {
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.click(bounds.x + (x / 960) * bounds.width, bounds.y + (y / 640) * bounds.height);
}

async function addSteps(page: Page) {
  await capture(page);
  await page.getByRole('button', { name: 'Step (S)', exact: true }).click();
  await clickPoint(page, 220, 220);
  await clickPoint(page, 480, 320);
  await clickPoint(page, 720, 420);
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await page.keyboard.press('Escape');
}

async function selectTwo(page: Page) {
  await page.keyboard.press('v');
  await clickPoint(page, 220, 220);
  await page.keyboard.down('Shift');
  await clickPoint(page, 480, 320);
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: 'Delete 2 selected elements' })).toBeVisible();
}

async function selectionOutlines(page: Page) {
  return page.evaluate(() => {
    const screenshot = document.querySelector('.screenshot-background')!.getBoundingClientRect();
    const overlay = document.querySelector<HTMLCanvasElement>('.selection-layer')!;
    const frame = overlay.getBoundingClientRect();
    const density = overlay.width / frame.width;
    const context = overlay.getContext('2d')!;
    return [
      [220, 220],
      [480, 320],
      [720, 420],
    ].map(([x, y]) => {
      const left = screenshot.left - frame.left + (x! / 960) * screenshot.width;
      const top = screenshot.top - frame.top + (y! / 640) * screenshot.height;
      const pixels = context.getImageData(
        Math.round((left - 40) * density),
        Math.round((top - 40) * density),
        Math.round(80 * density),
        Math.round(80 * density),
      ).data;
      return pixels.some((value, index) => index % 4 === 3 && value > 0);
    });
  });
}

test('Shift-click selects multiple elements and deletes them with one undo and redo', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await selectTwo(page);
  await expect.poll(() => selectionOutlines(page)).toEqual([true, true, false]);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('Shift toggles selection without moving objects and ordinary or blank clicks clear the group', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await selectTwo(page);
  await page.keyboard.down('Shift');
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.move(bounds.x + (480 / 960) * bounds.width, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + (580 / 960) * bounds.width, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await clickPoint(page, 480, 320);
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await selectTwo(page);
  await clickPoint(page, 720, 420);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await selectTwo(page);
  await clickPoint(page, 780, 550);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await selectTwo(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
});

test('multi-selection includes inserted images and the visible delete action removes the whole group', async ({
  desktop: page,
}) => {
  await addSteps(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    canvas.getContext('2d')!.fillRect(0, 0, 120, 80);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Add image file', { exact: true }).setInputFiles({
    name: 'multi-selection.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
  await page.keyboard.down('Shift');
  await clickPoint(page, 220, 220);
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Delete 2 selected elements' }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
});

test('delete inside a note edits text and does not delete the selected element', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await clickPoint(page, 220, 220);
  const note = page.getByRole('textbox', { name: 'Shape note', exact: true });
  await note.fill('Keep the step');
  await note.press('ControlOrMeta+a');
  await note.press('Backspace');
  await expect(note).toHaveValue('');
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(0);
});

test('a replacement screenshot clears the whole selection and its undo history', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await selectTwo(page);
  await capture(page);
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect.poll(() => selectionOutlines(page)).toEqual([false, false, false]);
});

test('undo prunes removed elements from the group and preserves the remaining selection', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await selectTwo(page);
  await page.keyboard.down('Shift');
  await clickPoint(page, 720, 420);
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: 'Delete 3 selected elements' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await expect(page.getByRole('button', { name: 'Delete 2 selected elements' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('button', { name: 'Delete object', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
});
