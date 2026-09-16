import { expect, type Page } from '@playwright/test';
import { test as desktopTest } from './bridge';

const SOURCE_WIDTH = 1920;
const SOURCE_HEIGHT = 1080;

async function openFineDetailImage(page: Page, checkerboard = false): Promise<void> {
  await page.evaluate(
    async ({ width, height, checkerboard }) => {
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const ctx = source.getContext('2d')!;
      const pixels = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          const check = (x + y) % 2 ? 255 : 0;
          pixels.data[offset] = checkerboard ? check : (x * 17 + y * 31) % 256;
          pixels.data[offset + 1] = checkerboard ? check : (x * 29 + y * 13) % 256;
          pixels.data[offset + 2] = checkerboard ? check : (x * 7 + y * 43) % 256;
          pixels.data[offset + 3] = 255;
        }
      }
      ctx.putImageData(pixels, 0, 0);
      const png = await new Promise<Blob>((resolve) => source.toBlob((blob) => resolve(blob!)));
      const files = new DataTransfer();
      files.items.add(new File([png], 'fine-detail.png', { type: 'image/png' }));
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { width: SOURCE_WIDTH, height: SOURCE_HEIGHT, checkerboard },
  );
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
  // Image decoding finishes before ResizeObserver computes the fitted preview.
  await expect
    .poll(() =>
      page.locator('.screenshot-background').evaluate((canvas) => {
        return canvas.getBoundingClientRect().width * window.devicePixelRatio;
      }),
    )
    .toBeLessThan(SOURCE_WIDTH);
}

for (const deviceScaleFactor of [1, 2]) {
  desktopTest.describe(`image quality at display scale ${deviceScaleFactor}`, () => {
    desktopTest.use({ deviceScaleFactor });

    desktopTest(
      'fit preview filters fine detail before WebView compositing',
      async ({ desktop: page }) => {
        await openFineDetailImage(page, true);
        const canvas = page.getByTestId('drawing-canvas');
        // A 2:1 reduction of a one-pixel checkerboard must blend the neighboring
        // black/white pixels, regardless of the engine's interpolation algorithm.
        const viewport = page.viewportSize()!;
        const stage = await page.locator('.stage-scroll').evaluate((element) => ({
          width: element.clientWidth,
          height: element.clientHeight,
        }));
        await page.setViewportSize({
          width: viewport.width + SOURCE_WIDTH / (2 * deviceScaleFactor) + 96 + 214 - stage.width,
          height:
            viewport.height + SOURCE_HEIGHT / (2 * deviceScaleFactor) + 96 + 162 - stage.height,
        });
        await expect
          .poll(
            async () =>
              (await page.locator('.screenshot-background').boundingBox())!.width *
              deviceScaleFactor,
          )
          .toBeCloseTo(SOURCE_WIDTH / 2, 0);
        await expect
          .poll(() =>
            canvas.evaluate((element) => {
              const canvas = element as HTMLCanvasElement;
              const ctx = canvas.getContext('2d')!;
              const source = document
                .querySelector('.screenshot-background')!
                .getBoundingClientRect();
              const frame = canvas.getBoundingClientRect();
              const ratio = window.devicePixelRatio;
              const pixels = ctx.getImageData(
                Math.round((source.x - frame.x) * ratio) + 5,
                Math.round((source.y - frame.y) * ratio) + 5,
                Math.round(source.width * ratio) - 10,
                Math.round(source.height * ratio) - 10,
              ).data;
              let blended = 0;
              for (let i = 0; i < pixels.length; i += 4)
                if (pixels[i]! > 16 && pixels[i]! < 239) blended++;
              return blended / (pixels.length / 4);
            }),
          )
          .toBeGreaterThan(0.95);
        const size = await canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const display = canvas.getBoundingClientRect();
          return {
            width: canvas.width,
            height: canvas.height,
            expectedWidth: Math.round(display.width * window.devicePixelRatio),
            expectedHeight: Math.round(display.height * window.devicePixelRatio),
          };
        });
        expect(size.width).toBe(size.expectedWidth);
        expect(size.height).toBe(size.expectedHeight);
      },
    );

    desktopTest(
      'actual pixels exposes source detail independently from fit preview',
      async ({ desktop: page }) => {
        await openFineDetailImage(page);
        const canvas = page.locator('.screenshot-background');
        const fitted = await canvas.boundingBox();
        expect(fitted!.width).toBeLessThan(SOURCE_WIDTH / deviceScaleFactor);
        await page.getByRole('button', { name: 'Actual pixels', exact: true }).click();
        await expect
          .poll(async () => (await canvas.boundingBox())!.width * deviceScaleFactor)
          .toBeCloseTo(SOURCE_WIDTH, 0);
        await expect
          .poll(async () => (await canvas.boundingBox())!.height * deviceScaleFactor)
          .toBeCloseTo(SOURCE_HEIGHT, 0);
        const surface = page.getByTestId('drawing-canvas');
        const stage = (await page.locator('.stage-scroll').boundingBox())!;
        // Zoom changes the camera, never the viewport-sized backing allocation.
        expect(Number(await surface.getAttribute('width'))).toBe(
          Math.round(stage.width * deviceScaleFactor),
        );
        expect(Number(await surface.getAttribute('height'))).toBe(
          Math.round(stage.height * deviceScaleFactor),
        );
        await page.getByRole('button', { name: 'Fit to screen', exact: true }).click();
        await expect
          .poll(async () => (await canvas.boundingBox())!.width)
          .toBeCloseTo(fitted!.width, 0);
      },
    );

    desktopTest(
      'saving a fitted preview preserves every source PNG pixel',
      async ({ desktop: page }) => {
        await openFineDetailImage(page);
        expect((await page.locator('.screenshot-background').boundingBox())!.width).toBeLessThan(
          SOURCE_WIDTH,
        );
        await page.getByRole('button', { name: 'Save PNG', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('PNG saved.');
        const exported = await page.evaluate(async () => {
          const saved = window.__desktopTest.calls.find((call) => call.command === 'save_png')!;
          const png = new Blob([new Uint8Array(saved.args.png as number[])], { type: 'image/png' });
          const url = URL.createObjectURL(png);
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let changedPixels = 0;
            for (let y = 0; y < canvas.height; y++) {
              for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                if (
                  pixels[offset] !== (x * 17 + y * 31) % 256 ||
                  pixels[offset + 1] !== (x * 29 + y * 13) % 256 ||
                  pixels[offset + 2] !== (x * 7 + y * 43) % 256 ||
                  pixels[offset + 3] !== 255
                )
                  changedPixels++;
              }
            }
            return { width: canvas.width, height: canvas.height, changedPixels };
          } finally {
            URL.revokeObjectURL(url);
          }
        });
        expect(exported).toEqual({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT, changedPixels: 0 });
      },
    );
  });
}
