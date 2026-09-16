import { test, expect, openImageEditor, downloadPng, dragOnCanvas } from './extension';

test('drawing remains responsive after download while Recent storage is pending', async ({
  page,
  extensionId,
}) => {
  await openImageEditor(page, extensionId);
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = open(...args);
      Object.defineProperty(request, 'onsuccess', {
        set(handler: (event: Event) => void) {
          request.addEventListener('success', (event) => {
            (window as unknown as { resumeRecent: () => void }).resumeRecent = () =>
              handler.call(request, event);
          });
        },
      });
      return request;
    };
  });
  try {
    await downloadPng(page);
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as unknown as { resumeRecent: unknown }).resumeRecent),
      )
      .toBe('function');
    await dragOnCanvas(page, { x: 160, y: 160 }, { x: 620, y: 300 });
    await expect(page.getByTestId('object-count')).toHaveText('1 object');
  } finally {
    await page.evaluate(() =>
      (window as unknown as { resumeRecent?: () => void }).resumeRecent?.(),
    );
  }
});
