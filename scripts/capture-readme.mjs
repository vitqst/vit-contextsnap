import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';

// Real extension UI, fictional data, disposable profile. No application state is injected.
// Run after npm run build; regenerate these screenshots when the editor UI changes.
const extensionPath = resolve('.output/chrome-mv3');
const outputPath = resolve('docs/images');
const sourceSize = { width: 1100, height: 700 };
const fixture = (await readFile('tests/fixtures/capture.html', 'utf8'))
  .replace('ContextSnap / browser capture fixture', 'Demo workspace / Plan review')
  .replace(
    'A local page with strict script CSP and predictable screenshot colors.',
    'Choose the right plan for your team. A fictional page for this demo.',
  )
  .replace(
    'Area capture target',
    '<strong>Billing details (fictional)</strong><p>Contact: <span id="demo-contact">demo@example.com</span></p><p>Reference: <span id="demo-reference">DEMO-2048</span></p>',
  );

await mkdir(outputPath, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write'],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const source = await context.newPage();
  await source.setViewportSize(sourceSize);
  await source.setContent(fixture);
  const contact = await source.locator('#demo-contact').boundingBox();
  const reference = await source.locator('#demo-reference').boundingBox();
  if (!contact || !reference) throw new Error('Fictional billing details are missing');
  const screenshot = await source.screenshot();
  await source.close();

  async function openEditor() {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/editor.html`);
    await page.getByLabel('Open image', { exact: true }).setInputFiles({
      name: 'Checkout review.png',
      mimeType: 'image/png',
      buffer: screenshot,
    });
    await expect(page.getByTestId('drawing-canvas')).toBeVisible();
    return page;
  }

  async function point(page, x, y) {
    const bounds = await page.getByTestId('drawing-canvas').boundingBox();
    if (!bounds) throw new Error('Drawing canvas is not visible');
    return {
      x: bounds.x + (x / sourceSize.width) * bounds.width,
      y: bounds.y + (y / sourceSize.height) * bounds.height,
    };
  }

  async function click(page, x, y) {
    const position = await point(page, x, y);
    await page.mouse.click(position.x, position.y);
  }

  async function drag(page, start, end) {
    const from = await point(page, ...start);
    const to = await point(page, ...end);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 16 });
    await page.mouse.up();
  }

  async function tool(page, name) {
    await page.getByRole('button', { name, exact: true }).click();
  }

  async function save(page, filename) {
    await page.mouse.move(1430, 980);
    await page.screenshot({ path: resolve(outputPath, filename), animations: 'disabled' });
  }

  if (process.argv.includes('--image-layers')) {
    const layers = await openEditor();
    await layers.getByLabel('Add image file', { exact: true }).setInputFiles({
      name: 'ContextSnap icon.png',
      mimeType: 'image/png',
      buffer: await readFile('public/icon/128.png'),
    });
    await expect(layers.getByTestId('object-count')).toHaveText('1 object');
    await drag(layers, [550, 350], [875, 560]);
    await drag(layers, [939, 624], [965, 650]);
    await tool(layers, 'Arrow (A)');
    await drag(layers, [545, 485], [801, 560]);
    await layers.getByRole('textbox', { name: 'Arrow label', exact: true }).fill('Your own icon');
    await layers.getByRole('textbox', { name: 'Arrow label', exact: true }).blur();
    await click(layers, 875, 560);
    await expect(layers.getByLabel('Image dimensions', { exact: true })).toHaveText('154 × 154 px');
    await save(layers, 'image-layers.png');
  } else {
    const overview = await openEditor();
    await tool(overview, 'Step (S)');
    for (const [x, y] of [
      [100, 223],
      [588, 223],
      [100, 463],
    ])
      await click(overview, x, y);
    await expect(overview.getByTestId('object-count')).toHaveText('3 objects');
    await tool(overview, 'Arrow (A)');
    await drag(overview, [955, 155], [735, 378]);
    await overview
      .getByRole('textbox', { name: 'Arrow label', exact: true })
      .fill('Make this action clearer');
    await overview.getByRole('textbox', { name: 'Arrow label', exact: true }).blur();
    await expect(overview.getByTestId('object-count')).toHaveText('4 objects');
    await save(overview, 'editor-overview.png');
    await overview.getByRole('button', { name: /^Copy image/ }).click();
    await expect(overview.getByRole('status')).toHaveText('Image copied. Ready to paste.');
    await expect(overview.getByRole('button', { name: /^Copy image/ })).toBeEnabled();
    await save(overview, 'copy-export.png');

    const magnifier = await openEditor();
    await tool(magnifier, 'Magnifier (M)');
    await tool(magnifier, 'Color #4f89c8');
    await drag(magnifier, [682, 380], [832, 380]);
    await expect(magnifier.getByRole('slider', { name: 'Magnification', exact: true })).toHaveValue(
      '2',
    );
    await expect(magnifier.getByTestId('object-count')).toHaveText('1 object');
    await save(magnifier, 'magnifier.png');

    const privacy = await openEditor();
    await tool(privacy, 'Redact (X)');
    await drag(
      privacy,
      [reference.x - 4, reference.y - 4],
      [reference.x + reference.width + 4, reference.y + reference.height + 4],
    );
    await tool(privacy, 'Blur (B)');
    await drag(
      privacy,
      [contact.x - 4, contact.y - 4],
      [contact.x + contact.width + 4, contact.y + contact.height + 4],
    );
    await expect(privacy.getByRole('slider', { name: 'Blur strength', exact: true })).toHaveValue(
      '12',
    );
    await expect(privacy.getByTestId('object-count')).toHaveText('2 objects');
    await save(privacy, 'privacy-tools.png');
  }
} finally {
  await context.close();
}
