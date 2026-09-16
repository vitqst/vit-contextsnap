import { test, expect } from './bridge';

test('moving blur and image previews bound CPU readback without weakening redaction or export', async ({
  desktop: page,
}, testInfo) => {
  const result = await page.evaluate(async (root) => {
    const { drawScene } = await import(`${root}/editor/render.ts`);
    const prototype = CanvasRenderingContext2D.prototype;
    const filter = Object.getOwnPropertyDescriptor(prototype, 'filter');
    const originalRead = prototype.getImageData;
    const reads: number[] = [];
    // Reproduce Linux WebKitGTK's missing canvas filter on both test engines.
    if (filter) {
      if (!filter.configurable) throw new Error('The test cannot simulate missing canvas filters.');
      Reflect.deleteProperty(prototype, 'filter');
    }
    prototype.getImageData = function (...args: Parameters<typeof originalRead>) {
      reads.push(args[2] * args[3]);
      return Reflect.apply(originalRead, this, args);
    };
    try {
      const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
      const createSession = (secret: string) => {
        const screenshot = document.createElement('canvas');
        screenshot.width = 960;
        screenshot.height = 640;
        const source = screenshot.getContext('2d')!;
        source.fillStyle = '#ffffff';
        source.fillRect(0, 0, 960, 640);
        source.fillStyle = '#2563eb';
        source.fillRect(300, 150, 330, 450);
        source.fillStyle = secret;
        source.fillRect(340, 240, 12, 12);
        const stamp = document.createElement('canvas');
        stamp.width = stamp.height = 128;
        const ink = stamp.getContext('2d')!;
        ink.fillStyle = '#ffffff';
        ink.fillRect(0, 0, 128, 128);
        ink.fillStyle = '#172033';
        for (let y = 0; y < 128; y += 4) ink.fillRect(0, y, 128, 2);
        const assets = new Map([
          ['stamp', { id: 'stamp', source: stamp, width: 128, height: 128 }],
        ]);
        const image = {
          id: 'image',
          seed: 1,
          type: 'image',
          style,
          assetId: 'stamp',
          rect: { x: 400, y: 330, width: 128, height: 128 },
        };
        const mask = {
          id: 'mask',
          seed: 2,
          type: 'redact',
          style,
          rect: { x: 340, y: 240, width: 12, height: 12 },
        };
        const blur = {
          id: 'blur',
          seed: 3,
          type: 'blur',
          style,
          rect: { x: 200, y: 180, width: 600, height: 400 },
          strength: 12,
        };
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 640;
        const ctx = canvas.getContext('2d')!;
        return (previewEffects: boolean, mode: 'blur' | 'image' = 'blur', offset = 0) => {
          const objects = [
            mode === 'image'
              ? { ...image, rect: { ...image.rect, x: image.rect.x + offset } }
              : image,
            mask,
            mode === 'blur' ? { ...blur, rect: { ...blur.rect, x: blur.rect.x + offset } } : blur,
          ];
          const startRead = reads.length;
          const start = performance.now();
          drawScene(ctx, screenshot, objects, undefined, assets, {
            expandedBackground: false,
            previewEffects,
          });
          const elapsedMs = performance.now() - start;
          const pixels = Reflect.apply(originalRead, ctx, [0, 0, 960, 640]).data;
          const sample = (x: number, y: number) => [
            ...pixels.slice((y * 960 + x) * 4, (y * 960 + x) * 4 + 4),
          ];
          return {
            pixels,
            elapsedMs,
            readPixels: reads.slice(startRead).reduce((sum, value) => sum + value, 0),
            mask: sample(345, 245),
            edge: sample(300, 400),
            outside: sample(100, 100),
          };
        };
      };
      const render = createSession('#ff0000');
      const previewRed = render(true);
      const previewBlue = createSession('#0000ff')(true);
      const full = render(false);
      let changedSecretChannels = 0;
      for (let i = 0; i < previewRed.pixels.length; i++)
        if (previewRed.pixels[i] !== previewBlue.pixels[i]) changedSecretChannels++;
      let edgeError = 0;
      let edgeChannels = 0;
      for (let x = 260; x < 340; x++)
        for (let channel = 0; channel < 3; channel++) {
          const i = (400 * 960 + x) * 4 + channel;
          edgeError += Math.abs(previewRed.pixels[i]! - full.pixels[i]!);
          edgeChannels++;
        }
      const modes = [];
      for (const mode of ['blur', 'image'] as const) {
        const previewTimes: number[] = [];
        const fullTimes: number[] = [];
        let maximumReadPixels = 0;
        for (let frame = 1; frame <= 7; frame++) {
          const preview = render(true, mode, frame);
          maximumReadPixels = Math.max(maximumReadPixels, preview.readPixels);
          previewTimes.push(preview.elapsedMs);
          fullTimes.push(render(false, mode, frame).elapsedMs);
        }
        previewTimes.sort((a, b) => a - b);
        fullTimes.sort((a, b) => a - b);
        modes.push({
          mode,
          maximumReadPixels,
          previewMedianMs: previewTimes[3],
          previewP95Ms: previewTimes[6],
          fullMedianMs: fullTimes[3],
          fullP95Ms: fullTimes[6],
        });
      }
      return {
        previewReadPixels: previewRed.readPixels,
        exportReadPixels: full.readPixels,
        changedSecretChannels,
        mask: previewRed.mask,
        edge: previewRed.edge,
        outside: previewRed.outside,
        edgeMeanError: edgeError / edgeChannels,
        modes,
      };
    } finally {
      if (filter) Object.defineProperty(prototype, 'filter', filter);
      prototype.getImageData = originalRead;
    }
  }, `/@fs${process.cwd()}/src`);
  console.log(`${testInfo.project.name} CPU blur preview:`, result);
  await testInfo.attach('cpu-blur-preview.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.previewReadPixels).toBeLessThan(30_000);
  expect(result.exportReadPixels).toBe(672 * 472);
  for (const mode of result.modes) expect(mode.maximumReadPixels).toBeLessThan(30_000);
  expect(result.changedSecretChannels).toBe(0);
  expect(result.mask).toEqual([0, 0, 0, 255]);
  expect(result.outside).toEqual([255, 255, 255, 255]);
  expect(result.edge[0]).toBeGreaterThan(40);
  expect(result.edge[0]).toBeLessThan(240);
  expect(result.edgeMeanError).toBeLessThan(16);
});
