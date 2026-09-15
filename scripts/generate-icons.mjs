import { chromium } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/* global Image, document -- evaluated in the isolated asset-generation browser */

// Source artwork stays editable in public/icon.svg. Run only when changing that artwork.
const artwork = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  await mkdir(new URL('../public/icon/', import.meta.url), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const base64 = await page.evaluate(
      async ({ artwork, size }) => {
        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artwork)}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { artwork, size },
    );
    await writeFile(
      new URL(`../public/icon/${size}.png`, import.meta.url),
      Buffer.from(base64, 'base64'),
    );
  }
} finally {
  await browser.close();
}
