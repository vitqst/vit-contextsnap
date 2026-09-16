import { test, expect, calls, capture, addArrow, drag, savedPixels } from './bridge';

test('desktop starts without Chrome and edits screenshots received through native IPC', async ({
  desktop: page,
}) => {
  expect(await page.evaluate(() => typeof window.chrome)).toBe('undefined');
  await page.keyboard.press('Control+Shift+s');
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to website' })).toHaveCount(0);
  await addArrow(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: /^Copy image/ }).click();
  await expect(page.getByRole('status')).toHaveText('Image copied. Ready to paste.');
  const copied = await calls(page, 'copy_png');
  expect(copied).toHaveLength(1);
  expect((copied[0]!.args.png as number[]).slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('a new screenshot replaces unsaved work without a prompt after Save PNG was canceled', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.evaluate(() => {
    window.__desktopTest.saveAccepted = false;
    window.__desktopTest.confirmAccepted = false;
  });
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(() => calls(page, 'save_png')).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  await expect(page.getByText('PNG saved.', { exact: true })).toHaveCount(0);
  await page.locator('header').getByRole('button', { name: 'Capture screenshot' }).click();
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(2);
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(page.context().pages()).toHaveLength(1);
});

test('saved PNG contains the arrow and permanent redaction, and clears dirty state', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.getByRole('button', { name: 'Redact (X)', exact: true }).click();
  await drag(page, { x: 90, y: 410 }, { x: 620, y: 510 });
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  const exported = await savedPixels(page);
  expect(exported).toMatchObject({
    width: 960,
    height: 640,
    privatePixel: [0, 0, 0, 255],
    untouchedPixel: [255, 255, 255, 255],
  });
  expect(exported.coloredArrowPixels).toBeGreaterThan(100);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'cancel';
  });
  await capture(page);
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
});

test('canceling the native screenshot preserves the image and undo history', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const before = await page
    .getByTestId('drawing-canvas')
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'cancel';
  });
  await capture(page);
  expect(await calls(page, 'capture_screenshot')).toHaveLength(2);
  expect(
    await page
      .getByTestId('drawing-canvas')
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).toBe(before);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('native screenshot failures are visible and a later retry can succeed', async ({
  desktop: page,
}) => {
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'error';
  });
  await page.locator('header').getByRole('button', { name: 'Capture screenshot' }).click();
  await expect(page.getByRole('alert')).toContainText('Screen capture permission denied.');
  await expect(page.getByTestId('drawing-canvas')).toHaveCount(0);
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'image';
  });
  await capture(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('pending capture blocks mutation shortcuts and pasted image layers', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'pending';
  });
  await page.locator('header').getByRole('button', { name: 'Capture screenshot' }).click();
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(2);
  await expect(page.locator('.editor-workspace')).toHaveAttribute('inert', '');
  await page.keyboard.press('Control+z');
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File(['not decoded'], 'pasted.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
    window.__desktopTest.releaseCapture();
  });
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('tray Quit checks current dirty state and honors cancel or discard', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.evaluate(async () => {
    window.__desktopTest.confirmAccepted = false;
    await window.__desktopTest.requestQuit();
  });
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(1);
  expect(await calls(page, 'quit_app')).toHaveLength(0);
  await page.evaluate(async () => {
    window.__desktopTest.confirmAccepted = true;
    await window.__desktopTest.requestQuit();
  });
  expect(await calls(page, 'quit_app')).toHaveLength(1);
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  await page.evaluate(() => window.__desktopTest.requestQuit());
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(2);
  expect(await calls(page, 'quit_app')).toHaveLength(2);
});

test('tray Screenshot replaces immediately in the same editor and ignores duplicate pending requests', async ({
  desktop: page,
}) => {
  await page.evaluate(() => window.__desktopTest.requestCapture());
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await addArrow(page);
  await page.evaluate(async () => {
    window.__desktopTest.confirmAccepted = false;
    await window.__desktopTest.requestCapture();
  });
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(2);
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
  expect(page.context().pages()).toHaveLength(1);
  await addArrow(page);
  await page.evaluate(async () => {
    window.__desktopTest.confirmAccepted = true;
    window.__desktopTest.captureResult = 'pending';
    await window.__desktopTest.requestCapture();
  });
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(3);
  await page.evaluate(() => window.__desktopTest.requestCapture());
  expect(await calls(page, 'capture_screenshot')).toHaveLength(3);
  await page.evaluate(() => window.__desktopTest.releaseCapture());
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('screenshot shortcut replaces the unsaved scene without warning or preserving old history', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.evaluate(() => {
    window.__desktopTest.confirmAccepted = false;
  });
  await page.keyboard.press('Control+Shift+s');
  await expect.poll(() => calls(page, 'capture_screenshot')).toHaveLength(2);
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
});

test('a failed replacement screenshot preserves the existing document and history without a prompt', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.evaluate(() => {
    window.__desktopTest.confirmAccepted = false;
    window.__desktopTest.captureResult = 'error';
  });
  await page.locator('header').getByRole('button', { name: 'Capture screenshot' }).click();
  await expect(page.getByRole('alert')).toContainText('Screen capture permission denied.');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
});

test('tray capture discards an active text draft only when a new screenshot succeeds', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Keep this on cancellation');
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'cancel';
    window.__desktopTest.confirmAccepted = false;
    void window.__desktopTest.requestCapture();
  });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    window.__desktopTest.captureResult = 'image';
    void window.__desktopTest.requestCapture();
  });
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
});

test('opening an image file still asks before discarding an unsaved scene', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const png = await page.evaluate(() => {
    window.__desktopTest.confirmAccepted = false;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'replacement.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await expect.poll(() => calls(page, 'plugin:dialog|message')).toHaveLength(1);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});
