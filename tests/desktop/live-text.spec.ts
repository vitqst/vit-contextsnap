import { test, expect, capture, drag } from './bridge';
import type { Page } from '@playwright/test';

const bitmap = (page: Page) =>
  page.getByTestId('drawing-canvas').evaluate(async (canvas) => {
    const bytes = new TextEncoder().encode((canvas as HTMLCanvasElement).toDataURL());
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });

test('note text paints while typing, fits the card, and cancels without changing history', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  await drag(page, { x: 300, y: 130 }, { x: 520, y: 280 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await expect(input).toBeFocused();
  const empty = await bitmap(page);
  await input.fill('A live note');
  await expect.poll(() => bitmap(page)).not.toBe(empty);
  const shortSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await input.fill(
    'Ghi chú tiếng Việt: text should fit this note immediately while I type, without cutting off the last words.',
  );
  await expect
    .poll(() => input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeLessThan(shortSize);
  await expect(input).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(input).toHaveCSS('border-top-width', '0px');
  await expect(input).toHaveCSS('outline-style', 'none');
  const live = await bitmap(page);
  await input.press('Control+Enter');
  await expect(input).toHaveCount(0);
  await expect.poll(() => bitmap(page)).toBe(live);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => bitmap(page)).toBe(empty);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => bitmap(page)).toBe(live);
  const bg = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.dblclick(bg.x + (bg.width * 410) / 960, bg.y + (bg.height * 205) / 640);
  await expect(input).toBeFocused();
  await input.fill('Cancel this edit');
  await expect.poll(() => bitmap(page)).not.toBe(live);
  await input.press('Escape');
  await expect.poll(() => bitmap(page)).toBe(live);
});

test('plain text has a wrapping width, unlimited height, live paint, and width handles', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await drag(page, { x: 340, y: 110 }, { x: 340, y: 110 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  const empty = await bitmap(page);
  await input.fill('Playpen Sans wraps words into a readable text box without a background.');
  await expect.poll(() => bitmap(page)).not.toBe(empty);
  const before = (await input.boundingBox())!;
  expect(before.height).toBeGreaterThan(before.width / 3);
  await expect(input).toHaveCSS('font-family', /Playpen Sans/);
  await input.press('Control+Enter');
  const bg = (await page.locator('.screenshot-background').boundingBox())!;
  // East handle is centered vertically on the text box.
  const x = (world: number) => bg.x + (world * bg.width) / 960;
  await page.mouse.move(x(560), before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(x(450), before.y + before.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.mouse.dblclick(x(370), before.y + 10);
  await expect(input).toBeFocused();
  await expect
    .poll(async () => (await input.boundingBox())!.width)
    .toBeLessThan(before.width * 0.75);
  await input.fill(Array.from({ length: 14 }, (_, i) => `Line ${i + 1}`).join('\n'));
  const lineHeight = await input.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  await expect.poll(() => input.evaluate((el) => el.clientHeight)).toBeGreaterThan(lineHeight * 13);
  await expect(input).toHaveJSProperty(
    'scrollHeight',
    await input.evaluate((el) => el.clientHeight),
  );
  const live = await bitmap(page);
  await input.press('Control+Enter');
  await expect.poll(() => bitmap(page)).toBe(live);
});

test('canceling a new text draft removes it without an undo entry', async ({ desktop: page }) => {
  await capture(page);
  const empty = await bitmap(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await drag(page, { x: 320, y: 140 }, { x: 320, y: 140 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Temporary');
  await expect.poll(() => bitmap(page)).not.toBe(empty);
  await input.press('Escape');
  await expect.poll(() => bitmap(page)).toBe(empty);
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('an oversized text edit keeps the last safe draft and exports that visible content', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await drag(page, { x: 320, y: 140 }, { x: 320, y: 140 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Keep this safe draft');
  await input.fill('Too tall\n'.repeat(1000));
  await expect(page.getByRole('alert')).toContainText('16,384');
  await expect(input).toHaveValue('Keep this safe draft');
  await input.press('Control+Enter');
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});
