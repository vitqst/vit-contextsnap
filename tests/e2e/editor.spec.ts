import {
  test,
  expect,
  openImageEditor,
  dragOnCanvas,
  canvasPoint,
  downloadPng,
  inspectPng,
  imageSize,
} from './extension';

test('arrow editing, undo, label and endpoint changes survive flattened PNG export', async ({
  page,
  extensionId,
}, testInfo) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await dragOnCanvas(page, { x: 160, y: 160 }, { x: 620, y: 300 }, true);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');

  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  const straight = await downloadPng(page);
  const midpoint = await canvasPoint(page, 390, 230);
  await page.mouse.click(midpoint.x, midpoint.y);
  await dragOnCanvas(page, { x: 390, y: 230 }, { x: 390, y: 150 });
  expect((await downloadPng(page)).equals(straight), 'Bending must change exported geometry').toBe(
    false,
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(straight)).toBe(true);
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  await page
    .getByRole('textbox', { name: 'Edit label', exact: true })
    .fill('Align checkout button');
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).press('Control+Enter');
  await expect(page.getByRole('textbox', { name: 'Arrow label', exact: true })).toHaveValue(
    'Align checkout button',
  );
  const beforeReshape = await downloadPng(page);
  await dragOnCanvas(page, { x: 620, y: 300 }, { x: 700, y: 360 });
  const movedEndpoint = await downloadPng(page);
  expect(movedEndpoint.equals(beforeReshape)).toBe(false);
  await dragOnCanvas(page, { x: 430, y: 260 }, { x: 460, y: 180 });
  const selected = await downloadPng(page);
  expect(selected.equals(movedEndpoint)).toBe(false);
  await expect(page.getByRole('textbox', { name: 'Arrow label', exact: true })).toHaveValue(
    'Align checkout button',
  );

  const screenshotPath = testInfo.outputPath('editor-arrow.png');
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach('editor-arrow.png', { path: screenshotPath, contentType: 'image/png' });

  const blank = await canvasPoint(page, 850, 570);
  await page.mouse.click(blank.x, blank.y);
  const unselected = await downloadPng(page);
  expect(unselected.equals(selected), 'Selection handles must never appear in export').toBe(true);
  const png = await inspectPng(page, selected);
  expect(png).toMatchObject(imageSize);
  await testInfo.attach('arrow-export.png', { body: selected, contentType: 'image/png' });
});

test('redaction overwrites source pixels and crop changes PNG dimensions with undo', async ({
  page,
  extensionId,
}, testInfo) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Redact (X)', exact: true }).click();
  await dragOnCanvas(page, { x: 90, y: 410 }, { x: 620, y: 510 });
  const redacted = await downloadPng(page);
  const pixels = await inspectPng(page, redacted, [
    { x: 150, y: 440 },
    { x: 300, y: 465 },
    { x: 600, y: 500 },
    { x: 800, y: 550 },
  ]);
  expect(pixels.pixels.slice(0, 3)).toEqual([
    [0, 0, 0, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ]);
  expect(pixels.pixels[3]).toEqual([255, 255, 255, 255]);

  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await dragOnCanvas(page, { x: 120, y: 80 }, { x: 760, y: 480 });
  const cropped = await downloadPng(page);
  expect(await inspectPng(page, cropped)).toMatchObject({ width: 640, height: 400 });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await inspectPng(page, await downloadPng(page))).toMatchObject(imageSize);
  await testInfo.attach('redacted-export.png', { body: redacted, contentType: 'image/png' });
});

test('Copy image writes an actual flattened PNG into the clipboard', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await dragOnCanvas(page, { x: 180, y: 180 }, { x: 500, y: 320 });
  await page.evaluate(() => navigator.clipboard.writeText('ContextSnap clipboard test'));
  await page.getByRole('button', { name: /^Copy image/ }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const image = items.find((item) => item.types.includes('image/png'));
        if (!image) return null;
        const blob = await image.getType('image/png');
        const bitmap = await createImageBitmap(blob);
        const result = { width: bitmap.width, height: bitmap.height, type: blob.type };
        bitmap.close();
        return result;
      }),
    )
    .toEqual({ ...imageSize, type: 'image/png' });
});

test('pen and text remain separate objects and deleting text can be undone', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
  await dragOnCanvas(page, { x: 160, y: 240 }, { x: 600, y: 300 });
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  const location = await canvasPoint(page, 260, 140);
  await page.mouse.click(location.x, location.y);
  const textEditor = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await textEditor.fill('Increase spacing');
  await textEditor.press('Control+Enter');
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  const withText = await downloadPng(page);
  await page.getByRole('button', { name: 'Delete object', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  const withoutText = await downloadPng(page);
  expect(withoutText.equals(withText)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  expect((await downloadPng(page)).equals(withText)).toBe(true);
});

test('starting an arrow drag commits and preserves the note being typed', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await dragOnCanvas(page, { x: 160, y: 160 }, { x: 620, y: 300 }, true);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  const location = await canvasPoint(page, 260, 80);
  await page.mouse.click(location.x, location.y);
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).fill('Keep this note');
  // Clicking the image blurs the textarea and begins a gesture in the same event.
  await dragOnCanvas(page, { x: 620, y: 300 }, { x: 700, y: 360 });
  await expect(page.getByRole('textbox', { name: 'Edit label', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('2 objects');
});
