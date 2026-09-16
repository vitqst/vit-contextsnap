import type { Page } from '@playwright/test';
import { test, expect, capture, drag, addArrow } from './bridge';

async function bitmap(page: Page): Promise<string> {
  return page.getByTestId('drawing-canvas').evaluate(async (canvas) => {
    const bytes = new TextEncoder().encode((canvas as HTMLCanvasElement).toDataURL());
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

async function addText(page: Page, tool: 'text' | 'sticky', text: string): Promise<void> {
  await page
    .getByRole('button', {
      name: tool === 'text' ? 'Text (T)' : 'Sticky note (N)',
      exact: true,
    })
    .click();
  await drag(page, { x: 300, y: 150 }, tool === 'text' ? { x: 300, y: 150 } : { x: 520, y: 320 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  const empty = await bitmap(page);
  await input.fill(text);
  await input.press('Control+Enter');
  await expect(input).toHaveCount(0);
  // React has committed the object when the input closes, but WebKit may not
  // have run the canvas paint scheduled for the next animation frame yet.
  await expect.poll(() => bitmap(page)).not.toBe(empty);
}

for (const kind of ['arrow', 'rectangle'] as const) {
  test(`${kind} labels have visible size presets and a bounded slider instead of a font dropdown`, async ({
    desktop: page,
  }) => {
    await capture(page);
    if (kind === 'arrow') await addArrow(page);
    else {
      await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
      await drag(page, { x: 300, y: 180 }, { x: 560, y: 330 });
    }
    const labelInput = page.getByRole('textbox', {
      name: kind === 'arrow' ? 'Arrow label' : 'Shape note',
    });
    const unlabeled = await bitmap(page);
    await labelInput.fill('Readable label');
    await expect.poll(() => bitmap(page)).not.toBe(unlabeled);
    const panel = page.getByRole('complementary', { name: 'Drawing properties' });
    const slider = panel.getByRole('slider', { name: 'Label size', exact: true });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('min', '12');
    await expect(slider).toHaveAttribute('max', '48');
    await expect(panel.getByRole('combobox', { name: 'Label size', exact: true })).toHaveCount(0);
    const before = await bitmap(page);
    const presets = panel.getByRole('group', { name: 'Label size presets', exact: true });
    await presets.getByRole('button', { name: '32 px', exact: true }).click();
    await expect(slider).toHaveValue('32');
    await expect(presets.getByRole('button', { name: '32 px', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => bitmap(page)).not.toBe(before);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(slider).toHaveValue('20');
    await expect.poll(() => bitmap(page)).toBe(before);
  });
}

test('sticky note font controls show the fitted size, select a manual preset, and restore Auto', async ({
  desktop: page,
}) => {
  await capture(page);
  await addText(page, 'sticky', 'Hi');
  const panel = page.getByRole('complementary', { name: 'Drawing properties' });
  const slider = panel.getByRole('slider', { name: 'Font size', exact: true });
  await expect(slider).toBeVisible();
  const auto = panel.getByRole('button', { name: 'Auto', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  const fitted = Number(await slider.inputValue());
  expect(fitted).toBeGreaterThan(24);
  await expect(panel.getByRole('combobox', { name: 'Font size', exact: true })).toHaveCount(0);
  const before = await bitmap(page);
  await panel
    .getByRole('group', { name: 'Font size presets', exact: true })
    .getByRole('button', { name: '24 px', exact: true })
    .click();
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await expect(slider).toHaveValue('24');
  await expect.poll(() => bitmap(page)).not.toBe(before);
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await expect(slider).toHaveValue(String(fitted));
  await expect.poll(() => bitmap(page)).toBe(before);
});

test('plain text slider previews during a drag and commits the whole gesture as one undo entry', async ({
  desktop: page,
}) => {
  await capture(page);
  await addText(page, 'text', 'Live font size');
  const panel = page.getByRole('complementary', { name: 'Drawing properties' });
  const slider = panel.getByRole('slider', { name: 'Font size', exact: true });
  await expect(slider).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Font size presets', exact: true })).toBeVisible();
  await expect(slider).toHaveValue('24');
  const before = await bitmap(page);
  const box = (await slider.boundingBox())!;
  const min = Number(await slider.getAttribute('min'));
  const max = Number(await slider.getAttribute('max'));
  const x = box.x + 7 + ((24 - min) / (max - min)) * (box.width - 14);
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 8 });
  await expect.poll(() => bitmap(page)).not.toBe(before);
  await page.mouse.up();
  const after = await bitmap(page);
  expect(Number(await slider.inputValue())).toBeGreaterThan(24);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(slider).toHaveValue('24');
  await expect.poll(() => bitmap(page)).toBe(before);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => bitmap(page)).toBe(after);
});

for (const method of ['pointercancel', 'Escape'] as const) {
  test(`${method} cancels font preview without committing the remaining pointer gesture`, async ({
    desktop: page,
  }) => {
    await capture(page);
    await addText(page, 'text', 'Cancel font changes');
    const slider = page.getByRole('slider', { name: 'Font size', exact: true });
    const before = await bitmap(page);
    const box = (await slider.boundingBox())!;
    const min = Number(await slider.getAttribute('min'));
    const max = Number(await slider.getAttribute('max'));
    const x = box.x + 7 + ((24 - min) / (max - min)) * (box.width - 14);
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 6 });
    await expect.poll(() => bitmap(page)).not.toBe(before);
    if (method === 'Escape') await page.keyboard.press('Escape');
    else await slider.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    await expect(slider).toHaveValue('24');
    await expect.poll(() => bitmap(page)).toBe(before);
    if (method === 'Escape')
      await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(slider).toHaveValue('24');
    await expect.poll(() => bitmap(page)).toBe(before);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('object-count')).toHaveText('0 objects');
  });
}

for (const tool of ['text', 'sticky'] as const) {
  test(`${tool} font preset commits the active new text draft without overwriting its contents`, async ({
    desktop: page,
  }) => {
    await capture(page);
    await page
      .getByRole('button', {
        name: tool === 'text' ? 'Text (T)' : 'Sticky note (N)',
        exact: true,
      })
      .click();
    await drag(page, { x: 300, y: 150 }, tool === 'text' ? { x: 300, y: 150 } : { x: 520, y: 320 });
    const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
    await input.fill('Preserve this draft');
    await page
      .getByRole('group', { name: 'Font size presets', exact: true })
      .getByRole('button', { name: '32 px', exact: true })
      .click();
    await expect(input).toHaveCount(0);
    await expect(page.getByTestId('object-count')).toHaveText('1 object');
    await expect(page.getByRole('slider', { name: 'Font size', exact: true })).toHaveValue('32');
    const bg = (await page.locator('.screenshot-background').boundingBox())!;
    const point = tool === 'text' ? { x: 310, y: 165 } : { x: 410, y: 235 };
    await page.mouse.dblclick(
      bg.x + (point.x / 960) * bg.width,
      bg.y + (point.y / 640) * bg.height,
    );
    await expect(input).toHaveValue('Preserve this draft');
  });
}
