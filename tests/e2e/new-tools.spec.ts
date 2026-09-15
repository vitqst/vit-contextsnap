import {
  test,
  expect,
  openImageEditor,
  canvasPoint,
  dragOnCanvas,
  downloadPng,
  inspectPng,
  imageSize,
} from './extension';
import type { Page } from '@playwright/test';

async function clickPoint(page: Page, x: number, y: number) {
  const point = await canvasPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function redBounds(page: Page, png: Buffer) {
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const red = pixels[index]!;
        const green = pixels[index + 1]!;
        const blue = pixels[index + 2]!;
        if (red > 160 && red - green > 45 && red - blue > 45) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    }
    bitmap.close();
    if (right < 0) throw new Error('Expected visible red annotation pixels');
    return { left, top, right, bottom };
  }, png.toString('base64'));
}

test('Step places consecutive numbers and keeps numbering through move, duplicate and undo', async ({
  page,
  extensionId,
}, testInfo) => {
  await openImageEditor(page, extensionId, 'effects');
  const stepTool = page.getByRole('button', { name: 'Step (S)', exact: true });
  await expect(stepTool).toBeVisible({ timeout: 1_500 });
  await stepTool.click();
  for (const [index, x] of [260, 450, 640].entries()) {
    await clickPoint(page, x, 220);
    await expect(page.getByLabel('Step number', { exact: true })).toHaveValue(String(index + 1));
    await expect(stepTool).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await clickPoint(page, 450, 220);
  await expect(page.getByLabel('Step number', { exact: true })).toHaveValue('2');
  await dragOnCanvas(page, { x: 450, y: 220 }, { x: 450, y: 320 });
  await expect(page.getByLabel('Step number', { exact: true })).toHaveValue('2');
  await page.getByRole('button', { name: 'Duplicate object', exact: true }).click();
  await expect(page.getByLabel('Step number', { exact: true })).toHaveValue('4');
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
  await page.getByRole('button', { name: 'Delete object', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('3 objects');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('4 objects');
  expect(await inspectPng(page, await downloadPng(page))).toMatchObject(imageSize);
  await page.getByRole('button', { name: 'Blur (B)', exact: true }).click();
  await dragOnCanvas(page, { x: 200, y: 180 }, { x: 400, y: 380 });
  await page.getByRole('button', { name: 'Magnifier (M)', exact: true }).click();
  await clickPoint(page, 330, 280);
  const screenshot = testInfo.outputPath('new-tools.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('new-tools.png', { path: screenshot, contentType: 'image/png' });
});

test('selecting a Step without moving does not add an invisible undo entry', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Step (S)', exact: true }).click();
  await clickPoint(page, 300, 280);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await downloadPng(page);
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await clickPoint(page, 800, 500);
  await clickPoint(page, 300, 280);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('object-count')).toHaveText('0 objects');
});

test('an inline label draft is unsaved even after the previous document was exported', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await dragOnCanvas(page, { x: 160, y: 160 }, { x: 620, y: 300 }, true);
  const label = page.getByRole('textbox', { name: 'Arrow label', exact: true });
  await label.fill('old');
  await label.blur();
  await downloadPng(page);
  const isUnloadPrevented = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await isUnloadPrevented(), 'An exported document without a draft is clean').toBe(false);
  const midpoint = await canvasPoint(page, 390, 230);
  await page.mouse.dblclick(midpoint.x, midpoint.y);
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).fill('new');
  expect(await isUnloadPrevented(), 'A pending inline draft must trigger the unsaved warning').toBe(
    true,
  );
});

test('Blur softens screenshot edges within its rectangle and remains undoable', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  const blurTool = page.getByRole('button', { name: 'Blur (B)', exact: true });
  await expect(blurTool).toBeVisible({ timeout: 1_500 });
  const original = await downloadPng(page);
  await blurTool.click();
  await dragOnCanvas(page, { x: 200, y: 180 }, { x: 400, y: 380 });
  const strength = page.getByRole('slider', { name: 'Blur strength', exact: true });
  await expect(strength).toHaveValue('12');
  const blurred = await downloadPng(page);
  const inspection = await inspectPng(page, blurred, [
    { x: 238, y: 280 },
    { x: 190, y: 280 },
  ]);
  expect(inspection).toMatchObject(imageSize);
  expect(inspection.pixels[0]![0]).toBeGreaterThan(37);
  expect(inspection.pixels[0]![0]).toBeLessThan(255);
  expect(inspection.pixels[1]).toEqual([255, 255, 255, 255]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(original)).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await clickPoint(page, 300, 280);
  await strength.focus();
  await strength.press('Home');
  await expect(strength).toHaveValue('4');
  expect((await downloadPng(page)).equals(blurred)).toBe(false);
});

test('Magnifier enlarges a circular source region and resamples after movement', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  const lensTool = page.getByRole('button', { name: 'Magnifier (M)', exact: true });
  await expect(lensTool).toBeVisible({ timeout: 1_500 });
  await lensTool.click();
  await clickPoint(page, 330, 280);
  const zoom = page.getByRole('slider', { name: 'Magnification', exact: true });
  const size = page.getByRole('slider', { name: 'Lens size', exact: true });
  await expect(zoom).toHaveValue('2');
  await expect(size).toHaveValue('72');
  const selected = await downloadPng(page);
  const inspection = await inspectPng(page, selected, [
    { x: 388, y: 280 },
    { x: 385, y: 335 },
  ]);
  expect(inspection.pixels[0]).toEqual([37, 99, 235, 255]);
  // A lens shadow is allowed outside the circle; enlarged blue content is not.
  expect(inspection.pixels[1]!.slice(0, 3).every((channel) => channel > 200)).toBe(true);
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await clickPoint(page, 800, 500);
  expect((await downloadPng(page)).equals(selected)).toBe(true);
  await clickPoint(page, 330, 280);
  await zoom.focus();
  await zoom.press('Home');
  await expect(zoom).toHaveValue('1.5');
  expect((await inspectPng(page, await downloadPng(page), [{ x: 388, y: 280 }])).pixels[0]).toEqual(
    [255, 255, 255, 255],
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await clickPoint(page, 330, 280);
  await size.focus();
  await size.press('Home');
  await expect(size).toHaveValue('32');
  expect((await inspectPng(page, await downloadPng(page), [{ x: 388, y: 280 }])).pixels[0]).toEqual(
    [255, 255, 255, 255],
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await clickPoint(page, 330, 280);
  await dragOnCanvas(page, { x: 330, y: 280 }, { x: 600, y: 280 });
  expect(
    (
      await inspectPng(page, await downloadPng(page), [
        { x: 600, y: 280 },
        { x: 388, y: 280 },
      ])
    ).pixels,
  ).toEqual([
    [255, 255, 255, 255],
    [255, 255, 255, 255],
  ]);
});

test('long labels stay bounded and move with their arrow near an image edge', async ({
  page,
  extensionId,
}, testInfo) => {
  await openImageEditor(page, extensionId, 'effects');
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await dragOnCanvas(page, { x: 20, y: 30 }, { x: 220, y: 50 }, true);
  const thickness = page.getByRole('slider', { name: /Thickness/ });
  await thickness.focus();
  await thickness.press('End');
  await expect(thickness).toHaveValue('16');
  const arrowOnly = await downloadPng(page);
  const label = page.getByRole('textbox', { name: 'Arrow label', exact: true });
  await label.fill('W'.repeat(90));
  await label.blur();
  const wrapped = await downloadPng(page);
  const before = await redBounds(page, wrapped);
  expect(before.left, 'Annotation text must not run off the image left edge').toBeGreaterThan(3);
  expect(before.top, 'Annotation text must not run off the image top edge').toBeGreaterThan(3);
  expect(
    before.right,
    'A long word must wrap instead of spanning the whole screenshot',
  ).toBeLessThan(500);
  expect(before.bottom, 'The long label should occupy multiple lines').toBeGreaterThan(80);
  const labelBody = { x: (before.left + before.right) / 2, y: before.bottom - 10 };
  await dragOnCanvas(page, labelBody, { x: labelBody.x + 80, y: labelBody.y });
  const after = await redBounds(page, await downloadPng(page));
  expect(
    after.right - before.right,
    'Dragging the attached label shifts its midpoint while respecting image bounds',
  ).toBeGreaterThan(20);
  expect(after.right - before.right).toBeLessThan(100);
  const screenshot = testInfo.outputPath('wrapped-label.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('wrapped-label.png', { path: screenshot, contentType: 'image/png' });
  await label.fill('');
  await label.blur();
  expect(
    (await downloadPng(page)).equals(arrowOnly),
    'Moving an attached label must move its arrow geometry too',
  ).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await label.fill('');
  await label.blur();
  expect(
    (await downloadPng(page)).equals(arrowOnly),
    'Undo restores the original arrow and label position',
  ).toBe(true);
});

for (const lensFirst of [false, true]) {
  test(`Magnifier samples privacy effects when created ${lensFirst ? 'before' : 'after'} them`, async ({
    page,
    extensionId,
  }) => {
    await openImageEditor(page, extensionId, 'effects');
    const lensTool = page.getByRole('button', { name: 'Magnifier (M)', exact: true });
    await expect(lensTool).toBeVisible({ timeout: 1_500 });
    const addLens = async () => {
      await lensTool.click();
      await clickPoint(page, 330, 280);
    };
    for (const effect of ['redact', 'blur'] as const) {
      await test.step(`${effect} is also applied to the sampled lens image`, async () => {
        const addEffect = async () => {
          await page
            .getByRole('button', {
              name: effect === 'redact' ? 'Redact (X)' : 'Blur (B)',
              exact: true,
            })
            .click();
          await dragOnCanvas(
            page,
            effect === 'redact' ? { x: 340, y: 250 } : { x: 200, y: 180 },
            effect === 'redact' ? { x: 380, y: 310 } : { x: 400, y: 380 },
          );
        };
        if (lensFirst) {
          await addLens();
          await addEffect();
        } else {
          await addEffect();
          await addLens();
        }
        const result = await inspectPng(page, await downloadPng(page), [{ x: 388, y: 280 }]);
        const pixel = result.pixels[0]!;
        if (effect === 'redact') expect(pixel).toEqual([0, 0, 0, 255]);
        else {
          expect(pixel[0]).toBeGreaterThan(37);
          expect(pixel[0]).toBeLessThan(240);
        }
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect(page.getByTestId('object-count')).toHaveText('0 objects');
      });
    }
  });
}
