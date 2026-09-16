import type { Page } from '@playwright/test';
import { test, expect, capture } from './bridge';

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

const nativeSelection = (page: Page) =>
  page.evaluate(() => window.getSelection()?.toString() ?? '');

test('Ctrl/Cmd+A selects every object including images, Delete is undoable, and Escape clears the group', async ({
  desktop: page,
}) => {
  await addSteps(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 60;
    canvas.getContext('2d')!.fillRect(0, 0, 100, 60);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Add image file', { exact: true }).setInputFiles({
    name: 'select-all.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
  await clickPoint(page, 850, 540);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByRole('button', { name: 'Delete 4 selected elements' })).toBeVisible();
  await expect.poll(() => nativeSelection(page)).toBe('');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByRole('button', { name: 'Delete 4 selected elements' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
});

test('explicit Meta+A selects objects from a non-text toolbar control without adding history', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await page.getByRole('button', { name: 'Select (V)', exact: true }).focus();
  await page.keyboard.press('Meta+a');
  await expect(page.getByRole('button', { name: 'Delete 3 selected elements' })).toBeVisible();
  await expect.poll(() => nativeSelection(page)).toBe('');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
});

test('Ctrl/Cmd+A from a focused font slider selects objects instead of page text', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await clickPoint(page, 320, 120);
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Select all objects');
  await input.press('Control+Enter');
  await page.getByRole('slider', { name: 'Font size', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByRole('button', { name: 'Delete 4 selected elements' })).toBeVisible();
  await expect.poll(() => nativeSelection(page)).toBe('');
});

test('Ctrl/Cmd+A from a slider also lets Delete remove a single selected object', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await clickPoint(page, 320, 120);
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Only one object');
  await input.press('Control+Enter');
  await page.getByRole('slider', { name: 'Font size', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('Ctrl/Cmd+A cancels an active font drag and suppresses its remaining pointer changes', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await clickPoint(page, 320, 120);
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Keep the original font');
  await input.press('Control+Enter');
  const slider = page.getByRole('slider', { name: 'Font size', exact: true });
  const box = (await slider.boundingBox())!;
  const min = Number(await slider.getAttribute('min'));
  const max = Number(await slider.getAttribute('max'));
  const start = box.x + 7 + ((24 - min) / (max - min)) * (box.width - 14);
  await page.mouse.move(start, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 6 });
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(24);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(slider).toHaveValue('24');
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(slider).toHaveValue('24');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  // Selection and the cancelled font gesture must not introduce history entries.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
});

test('Ctrl/Cmd+A in a sidebar textarea keeps native text selection and leaves objects intact', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await clickPoint(page, 220, 220);
  const input = page.getByRole('textbox', { name: 'Shape note', exact: true });
  await input.fill('Only select this note');
  await input.press('ControlOrMeta+a');
  expect(
    await input.evaluate((element) => {
      const field = element as HTMLTextAreaElement;
      return [field.selectionStart, field.selectionEnd];
    }),
  ).toEqual([0, 'Only select this note'.length]);
  await input.press('Backspace');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
});

test('Ctrl/Cmd+A inside an active canvas text draft stays native to the textarea', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await clickPoint(page, 320, 120);
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Select this draft');
  await input.press('ControlOrMeta+a');
  expect(
    await input.evaluate((element) => {
      const field = element as HTMLTextAreaElement;
      return [field.selectionStart, field.selectionEnd];
    }),
  ).toEqual([0, 'Select this draft'.length]);
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
  await input.press('Escape');
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
});

test('Ctrl/Cmd+A in an editable number field selects its value rather than objects', async ({
  desktop: page,
}) => {
  await addSteps(page);
  await clickPoint(page, 220, 220);
  const input = page.getByRole('spinbutton', { name: 'Step number', exact: true });
  await input.fill('123');
  await input.press('ControlOrMeta+a');
  await page.keyboard.type('9');
  await expect(input).toHaveValue('9');
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
});

test('Escape removes an existing native page selection', async ({ desktop: page }) => {
  await addSteps(page);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('header')!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  expect(await page.evaluate(() => window.getSelection()?.rangeCount)).toBe(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.rangeCount)).toBe(0);
});

test('Ctrl/Cmd+A on the empty editor does not select application UI text', async ({
  desktop: page,
}) => {
  await page.keyboard.press('ControlOrMeta+a');
  await expect.poll(() => nativeSelection(page)).toBe('');
  await expect(page.getByRole('button', { name: /Delete \d+ selected elements/ })).toHaveCount(0);
});
