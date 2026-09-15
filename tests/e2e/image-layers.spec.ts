import type { Page } from '@playwright/test';
import {
  test,
  expect,
  openImageEditor,
  downloadPng,
  inspectPng,
  imageSize,
  canvasPoint,
  dragOnCanvas,
} from './extension';

const MAGENTA = [220, 38, 127, 255];

async function imageFile(page: Page, color = '#dc267f', width = 240, height = 120) {
  const encoded = await page.evaluate(
    ({ color, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1]!;
    },
    { color, width, height },
  );
  return { name: 'local-layer.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64') };
}

async function addImage(page: Page, color = '#dc267f', width = 240, height = 120) {
  const file = await imageFile(page, color, width, height);
  await expect(page.getByRole('button', { name: 'Add image', exact: true })).toBeVisible({
    timeout: 1_500,
  });
  await page.getByLabel('Add image file', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('status')).toHaveText(
    'Image added. Drag to move; use a corner to resize.',
  );
}

async function clickPoint(page: Page, x: number, y: number) {
  const point = await canvasPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function magentaBounds(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] === 220 && data[index + 1] === 38 && data[index + 2] === 127) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left) throw new Error('No inserted image pixels found');
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }, png.toString('base64'));
}

test('Add image preserves the screenshot and exports the selected layer without handles', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await expect(page.getByRole('button', { name: 'Back to website', exact: true })).toHaveCount(0);
  await addImage(page);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('complementary', { name: 'Drawing properties' })).toContainText(
    'Image',
  );
  const selected = await downloadPng(page);
  const inspection = await inspectPng(page, selected, [
    { x: 480, y: 320 },
    { x: 280, y: 280 },
  ]);
  expect(inspection).toMatchObject(imageSize);
  expect(inspection.pixels).toEqual([MAGENTA, [37, 99, 235, 255]]);
  await page.keyboard.press('Escape');
  expect((await downloadPng(page)).equals(selected)).toBe(true);
});

test('image corners resize proportionally and moved assets survive duplicate, delete and undo', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await addImage(page);
  const original = await downloadPng(page);
  await dragOnCanvas(page, { x: 600, y: 380 }, { x: 720, y: 440 });
  const resized = await downloadPng(page);
  expect(await magentaBounds(page, resized)).toEqual({ x: 360, y: 260, width: 360, height: 180 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(original)).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await downloadPng(page)).equals(resized)).toBe(true);
  await dragOnCanvas(page, { x: 500, y: 330 }, { x: 580, y: 410 });
  const moved = await downloadPng(page);
  expect(await magentaBounds(page, moved)).toEqual({ x: 440, y: 340, width: 360, height: 180 });
  await page.getByRole('button', { name: 'Duplicate object', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  expect((await downloadPng(page)).equals(moved)).toBe(true);
  await clickPoint(page, 600, 400);
  await page.getByRole('button', { name: 'Delete object', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(moved)).toBe(true);
});

test('image order changes exported overlap and respects family boundaries and undo', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await addImage(page);
  await expect(page.getByRole('button', { name: 'Send backward', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeDisabled();
  await addImage(page, '#ffd400');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  const topPixel = async () =>
    (await inspectPng(page, await downloadPng(page), [{ x: 480, y: 320 }])).pixels[0];
  expect(await topPixel()).toEqual([255, 212, 0, 255]);
  await page.getByRole('button', { name: 'Send backward', exact: true }).click();
  expect(await topPixel()).toEqual(MAGENTA);
  await expect(page.getByRole('button', { name: 'Send backward', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await topPixel()).toEqual([255, 212, 0, 255]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await topPixel()).toEqual(MAGENTA);
  await page.getByRole('button', { name: 'Bring forward', exact: true }).click();
  expect(await topPixel()).toEqual([255, 212, 0, 255]);
  await expect(page.getByRole('button', { name: 'Bring forward', exact: true })).toBeDisabled();
});

test('real clipboard paste and file drop insert layers without intercepting text-field paste', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  const file = await imageFile(page);
  await page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) }),
    ]);
  }, file.buffer.toString('base64'));
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await clickPoint(page, 100, 100);
  const text = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await text.fill('Keep this note');
  const textPaste = page.evaluate(
    () =>
      new Promise<{ files: number; prevented: boolean }>((resolve) => {
        window.addEventListener(
          'paste',
          (event) =>
            resolve({
              files: event.clipboardData?.files.length ?? 0,
              prevented: event.defaultPrevented,
            }),
          { once: true },
        );
      }),
  );
  await text.press('Control+v');
  expect(await textPaste).toEqual({ files: 1, prevented: false });
  await expect(text).toHaveValue('Keep this note');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await text.press('Escape');
  const transfer = await page.evaluateHandle((encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'dropped-icon.png', { type: 'image/png' }));
    return data;
  }, file.buffer.toString('base64'));
  const dropPoint = await canvasPoint(page, 720, 180);
  await page.getByTestId('drawing-canvas').dispatchEvent('drop', {
    dataTransfer: transfer,
    clientX: dropPoint.x,
    clientY: dropPoint.y,
  });
  await transfer.dispose();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect(await inspectPng(page, await downloadPng(page))).toMatchObject(imageSize);
});

test('privacy effects process inserted pixels regardless of creation order and cropped export stays safe', async ({
  page,
  extensionId,
}) => {
  for (const masksFirst of [false, true]) {
    await openImageEditor(page, extensionId, 'effects');
    const addMask = async () => {
      await page.getByRole('button', { name: 'Redact (X)', exact: true }).click();
      await dragOnCanvas(page, { x: 580, y: 300 }, { x: 600, y: 340 });
    };
    const addLens = async () => {
      await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
      await clickPoint(page, 570, 320);
    };
    if (masksFirst) {
      await addMask();
      await addLens();
    }
    await addImage(page);
    if (!masksFirst) {
      await addLens();
      expect(
        // Sample five source pixels inside the image, away from interpolation at its edge.
        (await inspectPng(page, await downloadPng(page), [{ x: 620, y: 320 }])).pixels[0],
      ).toEqual(MAGENTA);
      await addMask();
    }
    const protectedImage = await inspectPng(page, await downloadPng(page), [
      { x: 590, y: 320 },
      { x: 620, y: 320 },
    ]);
    expect(protectedImage.pixels).toEqual([
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ]);
    await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
    // Grab the lens away from the redaction's hit tolerance at its right-hand side.
    await dragOnCanvas(page, { x: 520, y: 320 }, { x: 80, y: 320 });
    await page.getByRole('button', { name: 'Blur (B)', exact: true }).click();
    // The top edge borders white; the left edge borders the blue background fixture.
    await dragOnCanvas(page, { x: 420, y: 240 }, { x: 540, y: 290 });
    const softened = await inspectPng(page, await downloadPng(page), [{ x: 480, y: 275 }]);
    expect(softened.pixels[0]![0]).toBeGreaterThan(220);
    expect(softened.pixels[0]![0]).toBeLessThan(255);
    expect(softened.pixels[0]![1]).toBeGreaterThan(38);
    expect(softened.pixels[0]![1]).toBeLessThan(255);
    await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
    await dragOnCanvas(page, { x: 320, y: 240 }, { x: 700, y: 400 });
    const cropped = await inspectPng(page, await downloadPng(page), [{ x: 270, y: 80 }]);
    expect(cropped).toMatchObject({ width: 380, height: 160 });
    expect(cropped.pixels[0]).toEqual([0, 0, 0, 255]);
  }
});

test('a tiny image can be dragged by its center without accidentally resizing', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await addImage(page, '#dc267f', 30, 20);
  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  }
  await expect
    .poll(async () => (await page.getByTestId('drawing-canvas').boundingBox())?.width ?? Infinity)
    .toBeLessThan(imageSize.width * 0.6);
  await dragOnCanvas(page, { x: 480, y: 320 }, { x: 560, y: 400 });
  await expect(page.getByLabel('Image dimensions', { exact: true })).toHaveText('30 × 20 px');
  const moved = await inspectPng(page, await downloadPng(page), [
    { x: 560, y: 400 },
    { x: 480, y: 320 },
  ]);
  expect(moved.pixels).toEqual([MAGENTA, [255, 255, 255, 255]]);
});

test('Add image retains its accessible name in the narrow editor layout', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await page.setViewportSize({ width: 720, height: 900 });
  const button = page.getByRole('button', { name: 'Add image', exact: true });
  await expect(button).toBeVisible({ timeout: 1_500 });
  const file = await imageFile(page);
  const pending = page.waitForEvent('filechooser');
  await button.click();
  await (await pending).setFiles(file);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});
