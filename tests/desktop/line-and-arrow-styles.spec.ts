import type { Page } from '@playwright/test';
import { test, expect, capture, calls, drag } from './bridge';

async function shiftDrag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  const point = ({ x, y }: { x: number; y: number }) => ({
    x: bounds.x + (x / 960) * bounds.width,
    y: bounds.y + (y / 640) * bounds.height,
  });
  const from = point(start);
  const to = point(end);
  await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

async function exportedRedBounds(page: Page) {
  const previous = (await calls(page, 'save_png')).length;
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(previous + 1);
  return page.evaluate(async () => {
    const saved = window.__desktopTest.calls.filter((call) => call.command === 'save_png').at(-1)!;
    const image = new Image();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(saved.args.png as number[])], { type: 'image/png' }),
    );
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width;
      let top = canvas.height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < 400; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          const red = pixels[index]!;
          const green = pixels[index + 1]!;
          const blue = pixels[index + 2]!;
          if (red > 150 && red - green > 60 && red - blue > 60) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (right < 0) throw new Error('Expected red line pixels');
      return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

async function exportedRedStats(page: Page) {
  const previous = (await calls(page, 'save_png')).length;
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect.poll(async () => (await calls(page, 'save_png')).length).toBe(previous + 1);
  return page.evaluate(async () => {
    const saved = window.__desktopTest.calls.filter((call) => call.command === 'save_png').at(-1)!;
    const image = new Image();
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(saved.args.png as number[])], { type: 'image/png' }),
    );
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const points: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < 400; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          const red = pixels[index]!;
          const green = pixels[index + 1]!;
          const blue = pixels[index + 2]!;
          if (red > 150 && red - green > 60 && red - blue > 60) points.push({ x, y });
        }
      }
      if (!points.length) throw new Error('Expected red arrow pixels');
      const left = Math.min(...points.map((point) => point.x));
      const right = Math.max(...points.map((point) => point.x));
      const top = Math.min(...points.map((point) => point.y));
      const bottom = Math.max(...points.map((point) => point.y));
      const endpointSpan = (from: number, to: number) => {
        const ys = points
          .filter((point) => point.x >= from && point.x <= to)
          .map((point) => point.y);
        return ys.length ? Math.max(...ys) - Math.min(...ys) + 1 : 0;
      };
      return {
        count: points.length,
        width: right - left + 1,
        height: bottom - top + 1,
        startSpan: endpointSpan(left, left + 80),
        endSpan: endpointSpan(right - 80, right),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

test('Line tool is available by toolbar and L shortcut and preserves free angles', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Line (L)', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await drag(page, { x: 180, y: 140 }, { x: 520, y: 260 });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(
    page.getByRole('complementary', { name: 'Drawing properties' }).locator('.property-heading'),
  ).toHaveText(/^Line\s*Selected$/);
  const bounds = await exportedRedBounds(page);
  expect(bounds.width).toBeGreaterThan(300);
  expect(bounds.height).toBeGreaterThan(90);
  expect(bounds.height).toBeLessThan(160);
});

test('Line Shift gestures snap creation and endpoint edits to 45 degree increments', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Line (L)', exact: true }).click();
  await shiftDrag(page, { x: 200, y: 100 }, { x: 470, y: 230 });
  const diagonal = await exportedRedBounds(page);
  expect(Math.abs(diagonal.width - diagonal.height)).toBeLessThan(10);

  await shiftDrag(page, { x: 412, y: 312 }, { x: 650, y: 200 });
  const horizontal = await exportedRedBounds(page);
  expect(horizontal.width).toBeGreaterThan(400);
  expect(horizontal.height).toBeLessThan(15);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exportedRedBounds(page)).toEqual(diagonal);
});

test('arrow direction and style controls render an undoable curved Bold two-way arrow', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  await drag(page, { x: 180, y: 260 }, { x: 720, y: 260 });

  const direction = page.getByRole('group', { name: 'Arrow direction' });
  const appearance = page.getByRole('group', { name: 'Arrow style' });
  await expect(direction.getByRole('button', { name: 'One-way', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(appearance.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await direction.getByRole('button', { name: 'Two-way', exact: true }).click();
  await appearance.getByRole('button', { name: 'Bold', exact: true }).click();
  const straight = await exportedRedStats(page);
  expect(straight.count).toBeGreaterThan(3_000);
  expect(straight.startSpan).toBeGreaterThan(20);
  expect(straight.endSpan).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(appearance.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(appearance.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await drag(page, { x: 450, y: 260 }, { x: 450, y: 130 });
  const curved = await exportedRedStats(page);
  expect(curved.height).toBeGreaterThan(100);
  expect(curved.count).toBeGreaterThan(3_000);
  expect(curved.startSpan).toBeGreaterThan(20);
  expect(curved.endSpan).toBeGreaterThan(20);
});
