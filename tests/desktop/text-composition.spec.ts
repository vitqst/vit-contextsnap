import { test, expect, capture, drag } from './bridge';
import type { Page } from '@playwright/test';

async function bitmap(page: Page) {
  return page.getByTestId('drawing-canvas').evaluate(async (canvas) => {
    const bytes = new TextEncoder().encode((canvas as HTMLCanvasElement).toDataURL());
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  });
}

test('Vietnamese composition input paints before Enter and composition shortcuts do not finish the edit', async ({
  desktop: page,
}) => {
  await capture(page);
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  await drag(page, { x: 300, y: 130 }, { x: 620, y: 350 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Ghi chu hom nay');
  const before = await bitmap(page);
  await input.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.setSelectionRange(4, 7);
    textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    textarea.dispatchEvent(
      new CompositionEvent('compositionupdate', { bubbles: true, data: 'chú' }),
    );
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setValue.call(textarea, 'Ghi chú hom nay');
    textarea.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: 'chú',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
  });
  await expect.poll(() => bitmap(page)).not.toBe(before);
  await expect(input).toHaveValue('Ghi chú hom nay');
  const composed = await bitmap(page);
  await input.evaluate((element) => {
    for (const key of ['Escape', 'Enter'])
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key,
          ctrlKey: key === 'Enter',
          isComposing: true,
        }),
      );
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Ghi chú hom nay');
  await input.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'chú' }));
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setValue.call(textarea, 'Ghi chú hom nay');
    textarea.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: 'chú', inputType: 'insertText' }),
    );
  });
  await expect(input).toHaveValue('Ghi chú hom nay');
  await expect.poll(() => bitmap(page)).toBe(composed);
  await input.press('Control+Enter');
  await expect.poll(() => bitmap(page)).toBe(composed);
  await expect(page.getByRole('textbox', { name: 'Shape note', exact: true })).toHaveValue(
    'Ghi chú hom nay',
  );
});

test('Chromium native IME paints every Vietnamese replacement and preserves a single undoable text edit', async ({
  desktop: page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'The browser-native IME protocol is Chromium-only.');
  await capture(page);
  await page.getByRole('button', { name: 'Sticky note (N)', exact: true }).click();
  await drag(page, { x: 300, y: 130 }, { x: 620, y: 350 });
  const input = page.getByRole('textbox', { name: 'Edit label', exact: true });
  await input.fill('Ghi ');
  const session = await page.context().newCDPSession(page);
  let previous = await bitmap(page);
  for (const text of ['chu', 'chú', 'chữ']) {
    await session.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await expect(input).toHaveValue(`Ghi ${text}`);
    await expect.poll(() => bitmap(page)).not.toBe(previous);
    previous = await bitmap(page);
  }
  await session.send('Input.insertText', { text: 'chữ' });
  await expect(input).toHaveValue('Ghi chữ');
  await expect.poll(() => bitmap(page)).toBe(previous);
  await input.press('Control+Enter');
  await expect(page.getByRole('textbox', { name: 'Shape note', exact: true })).toHaveValue(
    'Ghi chữ',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Shape note', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Shape note', exact: true })).toHaveValue(
    'Ghi chữ',
  );
  await session.detach();
});
