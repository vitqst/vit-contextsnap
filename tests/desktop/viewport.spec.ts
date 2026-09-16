import { test, expect, capture, addArrow, calls } from './bridge';

test('zoom stays anchored at the mouse and Space-drag pans without editing', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const canvas = page.locator('.screenshot-background');
  const before = (await canvas.boundingBox())!;
  const pointer = { x: before.x + before.width * 0.3, y: before.y + before.height * 0.4 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(before.width);
  const zoomed = (await canvas.boundingBox())!;
  expect((pointer.x - zoomed.x) / zoomed.width).toBeCloseTo(0.3, 2);
  expect((pointer.y - zoomed.y) / zoomed.height).toBeCloseTo(0.4, 2);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(pointer.x + 90, pointer.y + 65, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const panned = (await canvas.boundingBox())!;
  expect(panned.x - zoomed.x).toBeCloseTo(90, 0);
  expect(panned.y - zoomed.y).toBeCloseTo(65, 0);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('dragging an arrow beyond the screenshot expands preview and PNG, including negative edges', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const canvas = page.getByTestId('drawing-canvas');
  const initial = (await page.locator('.screenshot-background').boundingBox())!;
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  const start = {
    x: initial.x + (initial.width * 390) / 960,
    y: initial.y + (initial.height * 266) / 640,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(initial.x - 90, initial.y - 55, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-world-x'))).toBeLessThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-world-y'))).toBeLessThan(0);
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  const saved = (await calls(page, 'save_png'))[0]!;
  const bytes = new Uint8Array(saved.args.png as number[]);
  const header = new DataView(bytes.buffer);
  expect(header.getUint32(16)).toBeGreaterThan(960);
  expect(header.getUint32(20)).toBeGreaterThan(640);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-world-x', '0');
  await expect(canvas).toHaveAttribute('data-world-y', '0');
});

test('dragging beyond the bottom-right edge retains the whole arrow without moving the camera', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const canvas = page.getByTestId('drawing-canvas');
  const initial = (await page.locator('.screenshot-background').boundingBox())!;
  const start = {
    x: initial.x + (initial.width * 390) / 960,
    y: initial.y + (initial.height * 266) / 640,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(initial.x + initial.width + 70, initial.y + initial.height + 40, {
    steps: 20,
  });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-world-width')))
    .toBeGreaterThan(960);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-world-height')))
    .toBeGreaterThan(640);
  const expanded = (await page.locator('.screenshot-background').boundingBox())!;
  expect(expanded.x).toBeCloseTo(initial.x, 0);
  expect(expanded.y).toBeCloseTo(initial.y, 0);
  await page.getByRole('button', { name: 'Fit to screen', exact: true }).click();
  const stage = (await page.locator('.stage-scroll').boundingBox())!;
  await expect
    .poll(async () => (await page.locator('.image-stage').boundingBox())!.width)
    .toBeLessThan(stage.width);
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('an oversized drag is rejected without allocating a huge canvas or losing the original arrow', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const canvas = page.getByTestId('drawing-canvas');
  const frame = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.move(frame.x + (frame.width * 390) / 960, frame.y + (frame.height * 266) / 640);
  await page.mouse.down();
  await page.mouse.move(frame.x + 20000, frame.y + frame.height / 2);
  await page.mouse.up();
  await expect(page.getByRole('alert')).toContainText('expanded canvas would exceed');
  await expect(canvas).toHaveAttribute('data-world-width', '960');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
});

test('inline note editing stays aligned after expanding above and left of the screenshot', async ({
  desktop: page,
}) => {
  await capture(page);
  await addArrow(page);
  const canvas = page.getByTestId('drawing-canvas');
  const initial = (await page.locator('.screenshot-background').boundingBox())!;
  const point = (x: number, y: number) => ({
    x: initial.x + (initial.width * x) / 960,
    y: initial.y + (initial.height * y) / 640,
  });
  const arrow = point(390, 266);
  await page.mouse.move(arrow.x, arrow.y);
  await page.mouse.down();
  await page.mouse.move(initial.x - 90, initial.y - 55, { steps: 20 });
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-world-x'))).toBeLessThan(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-world-y'))).toBeLessThan(0);

  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  const start = point(300, 300);
  const end = point(600, 500);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  const editor = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await expect(editor).toBeVisible();
  const box = (await editor.boundingBox())!;
  const lineHeight = await editor.evaluate((element) =>
    parseFloat(getComputedStyle(element).lineHeight),
  );
  // WebKit rounds pointer coordinates to CSS pixels. The editable hit area also
  // has a 24px minimum height, so compare the text line rather than that hit area.
  expect(Math.abs(box.x + box.width / 2 - (start.x + end.x) / 2)).toBeLessThan(1);
  expect(Math.abs(box.y + lineHeight / 2 - (start.y + end.y) / 2)).toBeLessThan(1);
  await editor.fill('Aligned note');
  await editor.press('Control+Enter');
  await page.mouse.dblclick((start.x + end.x) / 2, (start.y + end.y) / 2);
  await expect(editor).toHaveValue('Aligned note');
});

test('the workspace also fills narrow windows behind the floating panels', async ({
  desktop: page,
}) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await capture(page);
  const stage = (await page.locator('.stage-scroll').boundingBox())!;
  expect(stage.x).toBe(0);
  expect(stage.width).toBe(720);
});
