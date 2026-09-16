import { test, expect, capture } from './bridge';

test('every drawing tool offers Off, Soft and Hard shadows', async ({ desktop: page }) => {
  await capture(page);
  for (const name of [
    'Arrow (A)',
    'Pen (P)',
    'Rectangle (R)',
    'Text (T)',
    'Sticky note (N)',
    'Step (S)',
    'Magnifier (M)',
    'Blur (B)',
    'Redact (X)',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    const enabled = page.getByRole('checkbox', { name: 'Shadow', exact: true });
    await expect(enabled, `${name} supports shadows`).toBeVisible();
    await enabled.check();
    const modes = page.getByRole('group', { name: 'Shadow style', exact: true });
    await modes.getByRole('button', { name: 'Hard', exact: true }).click();
    await expect(modes.getByRole('button', { name: 'Hard', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await modes.getByRole('button', { name: 'Soft', exact: true }).click();
    await expect(modes.getByRole('button', { name: 'Soft', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await enabled.uncheck();
    await expect(enabled).not.toBeChecked();
  }
});

test('text shadow mode is editable, undoable, exported, and remembered for the next session', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Shadow', exact: true }).check();
  await page
    .getByRole('group', { name: 'Shadow style', exact: true })
    .getByRole('button', { name: 'Soft', exact: true })
    .click();
  const bounds = (await page.locator('.screenshot-background').boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const text = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await text.fill('Shadow text');
  await text.press('ControlOrMeta+Enter');
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
  const modes = page.getByRole('group', { name: 'Shadow style', exact: true });
  const hard = modes.getByRole('button', { name: 'Hard', exact: true });
  await hard.click();
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(modes.getByRole('button', { name: 'Soft', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('PNG saved.');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('contextsnap.drawingStyle') ?? '{}').shadowKind,
      ),
    )
    .toBe('hard');
  await page.reload();
  await capture(page);
  await page.getByRole('button', { name: 'Text (T)', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Shadow', exact: true })).toBeChecked();
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
});
