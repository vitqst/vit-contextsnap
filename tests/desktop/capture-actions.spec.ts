import { test, expect, calls, capture } from './bridge';

test('Screenshot opens the editor without writing the clipboard', async ({ desktop: page }) => {
  await page
    .locator('header')
    .getByRole('button', { name: 'Capture screenshot', exact: true })
    .click();
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  expect(await calls(page, 'copy_png')).toHaveLength(0);
});

test('Screenshot & Copy immediately copies the new screenshot', async ({ desktop: page }) => {
  await page
    .locator('header')
    .getByRole('button', { name: 'Screenshot & Copy', exact: true })
    .click();
  await expect.poll(() => calls(page, 'copy_png')).toHaveLength(1);
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  const copied = (await calls(page, 'copy_png'))[0]!.args.png as number[];
  expect(copied.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  await expect(page.getByRole('status')).toContainText('copied');
});

test('canceling Screenshot & Copy leaves the clipboard and document alone', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'cancel';
  });
  await page
    .locator('header')
    .getByRole('button', { name: 'Screenshot & Copy', exact: true })
    .click();
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(2);
  await expect(
    page.locator('header').getByRole('button', { name: 'Screenshot & Copy', exact: true }),
  ).toBeEnabled();
  expect(await calls(page, 'copy_png')).toHaveLength(0);
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
});

test('custom screenshot shortcuts can be saved', async ({ desktop: page }) => {
  await page.getByRole('button', { name: 'Configure screenshot shortcuts' }).click();
  const dialog = page.getByRole('dialog', { name: 'Screenshot shortcuts' });
  await expect(dialog.getByLabel('Screenshot', { exact: true })).toHaveValue('Ctrl+Shift+4');
  await expect(dialog.getByLabel('Screenshot & Copy', { exact: true })).toHaveValue(
    'Ctrl+Shift+Alt+4',
  );
  await dialog.getByLabel('Screenshot', { exact: true }).fill('Ctrl+Shift+5');
  await dialog.getByRole('button', { name: 'Save shortcuts' }).click();
  await expect.poll(() => calls(page, 'set_capture_shortcuts')).toHaveLength(1);
  expect((await calls(page, 'set_capture_shortcuts'))[0]!.args.settings).toMatchObject({
    screenshot: 'Ctrl+Shift+5',
  });
  await expect(dialog).not.toBeVisible();
});

test('capture controls remain inside the smallest desktop window', async ({ desktop: page }) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await capture(page);
  for (const name of [
    'Capture screenshot',
    'Screenshot & Copy',
    'Configure screenshot shortcuts',
    'Copy image',
  ]) {
    const button = page.locator('header').getByRole('button', { name, exact: true });
    const bounds = (await button.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(900);
  }
});

test('a successfully copied screenshot can quit without an unsaved prompt', async ({
  desktop: page,
}) => {
  await page
    .locator('header')
    .getByRole('button', { name: 'Screenshot & Copy', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('copied');
  await page.evaluate(() => window.__desktopTest.requestQuit());
  await expect.poll(() => calls(page, 'quit_app')).toHaveLength(1);
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
});
