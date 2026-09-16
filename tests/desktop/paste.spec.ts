import { test, expect, calls, capture, addArrow, savedPixels } from './bridge';

test('native image paste opens an empty desktop editor at the original dimensions', async ({
  desktop: page,
}) => {
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  expect(await calls(page, 'read_clipboard_png')).toHaveLength(1);
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  expect(await savedPixels(page)).toMatchObject({ width: 960, height: 640 });
});

test('native paste adds an undoable image layer without replacing the screenshot', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect(await calls(page, 'plugin:dialog|message')).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
});

test('Cmd+V uses the same native image paste path on macOS', async ({ desktop: page }) => {
  await page.keyboard.press('Meta+v');
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  expect(await calls(page, 'read_clipboard_png')).toHaveLength(1);
});

test('a menu paste event without WebKit image files uses the native clipboard', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.evaluate(() => {
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer() }));
  });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  expect(await calls(page, 'read_clipboard_png')).toHaveLength(1);
});

test('native paste does not duplicate a pending clipboard read when a paste event also arrives', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.evaluate(() => {
    window.__desktopTest.clipboardResult = 'pending';
  });
  await page.keyboard.press('Control+v');
  await expect.poll(() => calls(page, 'read_clipboard_png')).toHaveLength(1);
  await page.keyboard.press('Control+v');
  await page.evaluate(() => {
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: new DataTransfer() }));
    window.__desktopTest.releaseClipboard();
  });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  expect(await calls(page, 'read_clipboard_png')).toHaveLength(1);
});

test('pending native paste blocks a tray replacement and then unlocks the editor', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.evaluate(() => {
    window.__desktopTest.clipboardResult = 'pending';
  });
  await page.keyboard.press('Control+v');
  await expect.poll(() => calls(page, 'read_clipboard_png')).toHaveLength(1);
  await page.evaluate(() => window.__desktopTest.requestCapture());
  expect(await calls(page, 'capture_screenshot')).toHaveLength(1);
  await page.evaluate(() => window.__desktopTest.releaseClipboard());
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
});

test('text editing keeps the browser paste path and never reads the native image clipboard', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const label = page.getByRole('textbox', { name: 'Arrow label', exact: true });
  await label.fill('Keep my label');
  await label.press('Control+v');
  await label.evaluate((input) => {
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true }),
    );
  });
  await expect(label).toHaveValue('Keep my label');
  expect(await calls(page, 'read_clipboard_png')).toHaveLength(0);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('empty clipboard is harmless and a failed native paste can be retried', async ({
  desktop: page,
}) => {
  await page.evaluate(() => {
    window.__desktopTest.clipboardResult = 'empty';
  });
  await page.keyboard.press('Control+v');
  await expect.poll(() => calls(page, 'read_clipboard_png')).toHaveLength(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('drawing-canvas')).toHaveCount(0);
  await page.evaluate(() => {
    window.__desktopTest.clipboardResult = 'error';
  });
  await page.keyboard.press('Control+v');
  await expect(page.getByRole('alert')).toContainText('Could not read clipboard image');
  await page.evaluate(() => {
    window.__desktopTest.clipboardResult = 'image';
  });
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
