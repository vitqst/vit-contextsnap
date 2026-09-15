import { test as base, expect, type Page, type Worker } from '@playwright/test';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const test = base.extend<{ extensionId: string; serviceWorker: Worker }>({
  context: async ({ playwright, baseURL }, use, testInfo) => {
    const extensionPath = resolve('.output/chrome-mv3');
    await access(join(extensionPath, 'manifest.json')).catch(() => {
      throw new Error('Build the extension first: npm run build');
    });
    // An empty path asks Playwright for a disposable profile; no user profile is opened.
    const context = await playwright.chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.CONTEXTSNAP_HEADED,
      baseURL,
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      permissions: ['clipboard-read', 'clipboard-write'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await use(context);
    if (testInfo.status !== testInfo.expectedStatus) {
      await context.tracing.stop({ path: testInfo.outputPath('trace.zip') });
    } else {
      await context.tracing.stop();
    }
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export { expect };

export const imageSize = { width: 960, height: 640 };

export async function openImageEditor(
  page: Page,
  extensionId: string,
  fixture: 'default' | 'effects' = 'default',
): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/editor.html`);
  const png = await page.evaluate(
    ({ width, height, fixture }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      if (fixture === 'effects') {
        context.fillStyle = '#2563eb';
        context.fillRect(240, 220, 120, 120);
        return canvas.toDataURL('image/png').split(',')[1]!;
      }
      context.fillStyle = '#2563eb';
      context.fillRect(24, 24, 96, 48);
      context.fillStyle = '#f7ced6';
      context.fillRect(100, 420, 500, 80);
      context.fillStyle = '#172033';
      context.font = '24px sans-serif';
      context.fillText('sensitive@example.test', 120, 465);
      return canvas.toDataURL('image/png').split(',')[1]!;
    },
    { ...imageSize, fixture },
  );
  await page.getByLabel('Open image', { exact: true }).setInputFiles({
    name: 'checkout-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
}

export async function canvasPoint(page: Page, x: number, y: number) {
  const bounds = await page.getByTestId('drawing-canvas').boundingBox();
  if (!bounds) throw new Error('Editor canvas is not visible');
  return {
    x: bounds.x + (x / imageSize.width) * bounds.width,
    y: bounds.y + (y / imageSize.height) * bounds.height,
  };
}

export async function dragOnCanvas(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  shift = false,
): Promise<void> {
  const from = await canvasPoint(page, start.x, start.y);
  const to = await canvasPoint(page, end.x, end.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

export async function downloadPng(page: Page): Promise<Buffer> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('PNG download was not saved');
  return readFile(downloadedPath);
}

export async function inspectPng(
  page: Page,
  png: Buffer,
  points: Array<{ x: number; y: number }> = [],
) {
  return page.evaluate(
    async ({ encoded, points }) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(bitmap, 0, 0);
      const result = {
        width: bitmap.width,
        height: bitmap.height,
        pixels: points.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data)),
      };
      bitmap.close();
      return result;
    },
    { encoded: png.toString('base64'), points },
  );
}
