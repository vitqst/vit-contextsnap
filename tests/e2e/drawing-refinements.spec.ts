import {
  test,
  expect,
  openImageEditor,
  canvasPoint,
  dragOnCanvas,
  downloadPng,
  inspectPng,
} from './extension';

test('arrow label moves independently; mode and shadow changes are undoable', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Straight', exact: true }).click();
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await dragOnCanvas(page, { x: 180, y: 180 }, { x: 720, y: 180 });
  await page.getByRole('textbox', { name: 'Arrow label', exact: true }).fill('Attached label');
  await expect(page.getByRole('checkbox', { name: 'Shadow', exact: true })).toBeChecked();
  const shadowed = await downloadPng(page);
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  const flat = await downloadPng(page);
  expect(flat.equals(shadowed)).toBe(false);
  await page.getByRole('button', { name: 'Curved', exact: true }).click();
  expect((await downloadPng(page)).equals(flat)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(flat)).toBe(true);
  await dragOnCanvas(page, { x: 180, y: 153 }, { x: 220, y: 233 });
  const moved = await downloadPng(page);
  expect(moved.equals(flat)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(flat)).toBe(true);
});

for (const input of ['pen', 'mouse'] as const) {
  test(`${input} input produces real variable-width pixels and preserves pressure at release`, async ({
    page,
    context,
    extensionId,
  }) => {
    await openImageEditor(page, extensionId);
    await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
    await page.getByRole('slider', { name: /Thickness/ }).fill('8');
    await page
      .getByRole('slider', { name: 'Pressure influence', exact: true })
      .fill(input === 'pen' ? '1' : '0');
    await page
      .getByRole('slider', { name: 'Speed influence', exact: true })
      .fill(input === 'mouse' ? '1' : '0');
    const cdp = await context.newCDPSession(page);
    let timestamp = Date.now() / 1000;
    for (const [row, y] of [280, 400].entries()) {
      const pressure = row === 0 ? 0.15 : 0.85;
      const interval = input === 'mouse' ? (row === 0 ? 0.002 : 0.12) : 0.016;
      const from = await canvasPoint(page, 180, y);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        ...from,
        pointerType: input,
        timestamp,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...from,
        pointerType: input,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        force: pressure,
        timestamp: (timestamp += interval),
      });
      for (let x = 200; x <= 720; x += 20) {
        const point = await canvasPoint(page, x, y);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          ...point,
          pointerType: input,
          button: 'left',
          buttons: 1,
          force: pressure,
          timestamp: (timestamp += interval),
        });
      }
      const end = await canvasPoint(page, 720, y);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...end,
        pointerType: input,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        force: 0,
        timestamp: (timestamp += interval),
      });
      timestamp += 1;
    }
    await expect(page.getByTestId('object-count')).toHaveText('2 objects');
    const png = await downloadPng(page);
    const points = [280, 400].flatMap((center) =>
      Array.from({ length: 61 }, (_, index) => ({ x: 450, y: center - 30 + index })),
    );
    const { pixels } = await inspectPng(page, png, points);
    const red = (pixel: number[]) => pixel[0]! > 150 && pixel[1]! < 140 && pixel[2]! < 140;
    const thin = pixels.slice(0, 61).filter(red).length;
    const thick = pixels.slice(61).filter(red).length;
    expect(thin).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(thin * 2);
    await page
      .getByRole('slider', {
        name: input === 'pen' ? 'Pressure influence' : 'Speed influence',
        exact: true,
      })
      .fill('0');
    expect((await downloadPng(page)).equals(png)).toBe(false);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await downloadPng(page)).equals(png)).toBe(true);
    await cdp.detach();
  });
}

test('sticky cards and shape notes cannot uncover redacted source pixels', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId, 'effects');
  await page.getByRole('button', { name: 'Redact (X)', exact: true }).click();
  await dragOnCanvas(page, { x: 250, y: 250 }, { x: 410, y: 390 });
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  const point = await canvasPoint(page, 380, 350);
  await page.mouse.click(point.x, point.y);
  await page
    .getByRole('textbox', { name: 'Edit label', exact: true })
    .fill('Card added after mask');
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).press('Control+Enter');
  const png = await downloadPng(page);
  expect(
    (
      await inspectPng(page, png, [
        { x: 300, y: 300 },
        { x: 380, y: 350 },
      ])
    ).pixels,
  ).toEqual([
    [0, 0, 0, 255],
    [0, 0, 0, 255],
  ]);
  await page.getByRole('button', { name: 'Crop (C)', exact: true }).click();
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 600, y: 500 });
  expect((await inspectPng(page, await downloadPng(page), [{ x: 100, y: 100 }])).pixels).toEqual([
    [0, 0, 0, 255],
  ]);
});

test('rectangle notes edit in place and stay with their shape through move and undo', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await dragOnCanvas(page, { x: 220, y: 180 }, { x: 560, y: 360 });
  const center = await canvasPoint(page, 390, 270);
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).fill('Keep this together');
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).press('Control+Enter');
  const labeled = await downloadPng(page);
  await dragOnCanvas(page, { x: 390, y: 360 }, { x: 510, y: 450 });
  expect((await downloadPng(page)).equals(labeled)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(labeled)).toBe(true);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByRole('textbox', { name: 'Edit label', exact: true })).toHaveValue(
    'Keep this together',
  );
});

for (const shape of ['redact', 'white rectangle'] as const) {
  test(`${shape} notes use plain shape-colored text while editing`, async ({
    page,
    extensionId,
  }) => {
    await openImageEditor(page, extensionId);
    await page
      .getByRole('button', {
        name: shape === 'redact' ? 'Redact (X)' : 'Rectangle (R)',
        exact: true,
      })
      .click();
    if (shape === 'white rectangle') {
      await page.getByRole('button', { name: 'Color #ffffff', exact: true }).click();
    }
    await dragOnCanvas(page, { x: 220, y: 180 }, { x: 560, y: 360 });
    const center = await canvasPoint(page, 390, 270);
    await page.mouse.dblclick(center.x, center.y);
    const editor = page.getByRole('textbox', { name: 'Edit label', exact: true });
    await editor.fill('Readable while editing');
    await expect(editor).toHaveCSS(
      'color',
      shape === 'redact' ? 'rgb(224, 82, 82)' : 'rgb(255, 255, 255)',
    );
    await expect(editor).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await editor.press('Control+Enter');
    await page.mouse.dblclick(center.x, center.y);
    await expect(editor).toHaveValue('Readable while editing');
  });
}

test('sticky cards type directly, resize, toggle their default shadow and undo', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  const center = await canvasPoint(page, 440, 300);
  await page.mouse.click(center.x, center.y);
  await page
    .getByRole('textbox', { name: 'Edit label', exact: true })
    .fill('A useful note\nKeep the spacing');
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).press('Control+Enter');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  await expect(page.getByRole('checkbox', { name: 'Shadow', exact: true })).toBeChecked();
  const before = await downloadPng(page);
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).uncheck();
  expect((await downloadPng(page)).equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(before)).toBe(true);
  await dragOnCanvas(page, { x: 550, y: 375 }, { x: 660, y: 450 });
  expect((await downloadPng(page)).equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(before)).toBe(true);
  await page.mouse.dblclick(center.x, center.y);
  await expect(page.getByRole('textbox', { name: 'Edit label', exact: true })).toHaveValue(
    'A useful note\nKeep the spacing',
  );
});

test('brush settings apply to the selected stroke and are undoable', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Smoothing', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Pressure influence', exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Speed influence', exact: true }).fill('0');
  await dragOnCanvas(page, { x: 200, y: 250 }, { x: 740, y: 290 });
  const constant = await downloadPng(page);
  await page.getByRole('slider', { name: 'Speed influence', exact: true }).fill('1');
  expect((await downloadPng(page)).equals(constant)).toBe(false);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await downloadPng(page)).equals(constant)).toBe(true);
});

test('an unrelated pointer cancel cannot discard the active stroke', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Pen (P)', exact: true }).click();
  const start = await canvasPoint(page, 200, 200);
  const end = await canvasPoint(page, 600, 220);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page
    .getByTestId('drawing-canvas')
    .dispatchEvent('pointercancel', { pointerId: 999, pointerType: 'touch' });
  await page
    .getByTestId('drawing-canvas')
    .dispatchEvent('lostpointercapture', { pointerId: 999, pointerType: 'touch' });
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});

test('opening and closing a shape note without edits does not consume undo', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  await dragOnCanvas(page, { x: 200, y: 200 }, { x: 600, y: 380 });
  const center = await canvasPoint(page, 400, 290);
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).fill('Only one edit');
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).press('Control+Enter');
  await page.mouse.dblclick(center.x, center.y);
  await page.getByRole('textbox', { name: 'Edit label', exact: true }).blur();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Shape note', exact: true })).toHaveValue('');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
});
