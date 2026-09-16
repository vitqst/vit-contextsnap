import { test, expect, capture, drag } from './bridge';

test('note font follows card size during corner resizing and undo restores its automatic fit', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  await drag(page, { x: 300, y: 130 }, { x: 520, y: 280 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Chú ý');
  const original = await input.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  expect(original).toBeGreaterThan(24);
  await input.press('Control+Enter');
  await drag(page, { x: 520, y: 280 }, { x: 740, y: 430 });
  const slider = page.getByRole('slider', { name: 'Font size', exact: true });
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(original * 1.5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(slider).toHaveValue(String(original));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(original * 1.5);
});
