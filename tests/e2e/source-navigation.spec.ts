import {
  test,
  expect,
  openImageEditor,
  dragOnCanvas,
  downloadPng,
  inspectPng,
  imageSize,
} from './extension';
import type { CaptureRecord } from '../../src/platform/types';

test('Back is hidden for a locally imported image', async ({ page, extensionId }) => {
  await openImageEditor(page, extensionId);
  await expect(page.getByRole('button', { name: 'Back to website', exact: true })).toHaveCount(0);
});

test('a capture without readable opener access opens its saved URL and keeps editor work', async ({
  page,
  context,
  extensionId,
  serviceWorker,
}) => {
  await page.goto('/capture.html');
  await page.bringToFront();
  const sourceUrl = page.url();
  const source = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) throw new Error('Missing fixture tab');
    return { id: tab.id, windowId: tab.windowId, url: tab.url };
  });
  // No extension action granted activeTab here. Exercise the real inaccessible-URL fallback.
  expect(source.url).toBeUndefined();
  const captureId = await serviceWorker.evaluate(async (url) => {
    const canvas = new OffscreenCanvas(960, 640);
    const drawing = canvas.getContext('2d');
    if (!drawing) throw new Error('Canvas unavailable');
    drawing.fillStyle = '#ffffff';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    const record = {
      version: 1,
      id: crypto.randomUUID(),
      image: await canvas.convertToBlob({ type: 'image/png' }),
      width: canvas.width,
      height: canvas.height,
      title: 'Local source navigation fixture',
      url,
      createdAt: new Date().toISOString(),
      mode: 'visible',
    } satisfies CaptureRecord;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('contextsnap-captures', 1);
      request.onupgradeneeded = () => {
        for (const name of ['pending', 'recent']) {
          request.result.createObjectStore(name, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('pending', 'readwrite');
        transaction.objectStore('pending').put(record);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
    return record.id;
  }, sourceUrl);
  const [editor] = await Promise.all([
    context.waitForEvent('page'),
    serviceWorker.evaluate(
      ({ extensionId, captureId, source }) =>
        chrome.tabs.create({
          url: `chrome-extension://${extensionId}/editor.html?capture=${captureId}`,
          windowId: source.windowId,
          openerTabId: source.id,
        }),
      { extensionId, captureId, source },
    ),
  ]);
  await expect(editor.getByTestId('drawing-canvas')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Back to website', exact: true })).toBeVisible({
    timeout: 1_500,
  });
  await dragOnCanvas(editor, { x: 180, y: 180 }, { x: 600, y: 300 }, true);
  await editor.getByRole('textbox', { name: 'Arrow label', exact: true }).fill('Keep this note');
  const [website] = await Promise.all([
    context.waitForEvent('page'),
    editor.getByRole('button', { name: 'Back to website', exact: true }).click(),
  ]);
  await expect(website).toHaveURL(sourceUrl);
  await expect(page).toHaveURL(sourceUrl);
  expect(editor.isClosed()).toBe(false);
  await editor.bringToFront();
  await expect(editor.getByTestId('object-count')).toHaveText('1 object');
  await expect(editor.getByRole('textbox', { name: 'Arrow label', exact: true })).toHaveValue(
    'Keep this note',
  );
  await expect(editor.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  expect(await inspectPng(editor, await downloadPng(editor))).toMatchObject(imageSize);
});
