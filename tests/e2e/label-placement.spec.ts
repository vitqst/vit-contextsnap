import type { Page } from '@playwright/test';
import { test, expect, openImageEditor, dragOnCanvas, downloadPng, inspectPng } from './extension';

// The colored fixture exposes white backgrounds that a white screenshot would hide.
test('arrow tail labels drag independently and export only colored text', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await page.getByRole('button', { name: 'Straight', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await dragOnCanvas(page, { x: 300, y: 320 }, { x: 720, y: 320 });
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  const bare = await downloadPng(page);
  const label = page.getByRole('textbox', { name: 'Arrow label', exact: true });
  await label.fill('Tail');
  await label.blur();
  const labeled = await downloadPng(page);
  const tailText = await labelPixels(page, bare, labeled);
  expect(tailText.count).toBeGreaterThan(50);
  expect(tailText.right).toBeLessThan(350);
  expect(tailText.bottom).toBeLessThan(312);
  expect(tailText.white).toBe(0);
  const pixels = await inspectPng(page, labeled, [
    { x: 275, y: 278 },
    { x: 500, y: 320 },
  ]);
  expect(pixels.pixels[0]).toEqual([37, 99, 235, 255]);
  expect(pixels.pixels[1]).toEqual((await inspectPng(page, bare, [{ x: 500, y: 320 }])).pixels[0]);
  await dragOnCanvas(page, { x: 300, y: 293 }, { x: 400, y: 213 });
  expect((await downloadPng(page)).equals(labeled)).toBe(false);
  await label.fill('');
  await label.blur();
  expect((await downloadPng(page)).equals(bare)).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(labeled)).toBe(true);
});

test('rectangle labels support presets, independent drag, move and corner resize', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await dragOnCanvas(page, { x: 240, y: 280 }, { x: 560, y: 400 });
  const bare = await downloadPng(page);
  const note = page.getByRole('textbox', { name: 'Shape note', exact: true });
  await note.fill('Rectangle label');
  await note.blur();
  const position = page.getByRole('combobox', { name: 'Label position', exact: true });
  await expect(position).toHaveValue('top');
  const top = await downloadPng(page);
  const topText = await labelPixels(page, bare, top);
  expect(topText.count).toBeGreaterThan(50);
  expect(topText.bottom).toBeLessThan(272);
  expect(topText.white).toBe(0);
  await position.selectOption('bottom');
  const bottom = await downloadPng(page);
  expect(bottom.equals(top)).toBe(false);
  await position.selectOption('inside');
  expect((await downloadPng(page)).equals(bottom)).toBe(false);
  await position.selectOption('top');
  await position.selectOption('free');
  expect((await downloadPng(page)).equals(top)).toBe(true);
  await dragOnCanvas(page, { x: 400, y: 253 }, { x: 450, y: 193 });
  await expect(position).toHaveValue('free');
  await note.fill('');
  await note.blur();
  expect((await downloadPng(page)).equals(bare)).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  // Reset, move the outline, then resize its lower-right corner.
  await position.selectOption('top');
  await dragOnCanvas(page, { x: 500, y: 400 }, { x: 520, y: 420 });
  await dragOnCanvas(page, { x: 580, y: 420 }, { x: 680, y: 460 });
  const resized = await downloadPng(page);
  expect((await inspectPng(page, resized, [{ x: 680, y: 440 }])).pixels[0]).toEqual([
    224, 82, 82, 255,
  ]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(resized)).toBe(false);
});

async function labelPixels(page: Page, before: Buffer, after: Buffer) {
  return page.evaluate(
    async ({ before, after }) => {
      const decode = async (encoded: string) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], { type: 'image/png' }),
        );
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      const a = await decode(before);
      const b = await decode(after);
      let count = 0,
        right = 0,
        bottom = 0,
        white = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (
          a.data[i] === b.data[i] &&
          a.data[i + 1] === b.data[i + 1] &&
          a.data[i + 2] === b.data[i + 2]
        )
          continue;
        count++;
        right = Math.max(right, (i / 4) % a.width);
        bottom = Math.max(bottom, Math.floor(i / 4 / a.width));
        if (
          b.data[i]! > 240 &&
          b.data[i + 1]! > 240 &&
          b.data[i + 2]! > 240 &&
          (a.data[i]! < 240 || a.data[i + 1]! < 240 || a.data[i + 2]! < 240)
        )
          white++;
      }
      return { count, right, bottom, white };
    },
    { before: before.toString('base64'), after: after.toString('base64') },
  );
}
