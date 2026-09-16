import { test, expect } from './bridge';

for (const [placement, withBlur] of [
  ['screenshot', false],
  ['inserted image', false],
  ['screenshot', true],
  ['inserted image', true],
] as const) {
  test(`fractional preview zoom never reveals redacted ${placement} pixels${withBlur ? ' with preview blur' : ''}`, async ({
    desktop: page,
  }) => {
    const result = await page.evaluate(
      async ({ root, placement, withBlur }) => {
        const { drawScene } = await import(`${root}/editor/render.ts`);
        const style = { color: '#ff0000', width: 4, sketch: false, shadow: false };
        const render = (secretColor: string) => {
          const screenshot = document.createElement('canvas');
          screenshot.width = screenshot.height = 100;
          const screenshotContext = screenshot.getContext('2d')!;
          screenshotContext.fillStyle = '#ffffff';
          screenshotContext.fillRect(0, 0, 100, 100);
          const stamp = document.createElement('canvas');
          stamp.width = stamp.height = 100;
          const secret = placement === 'screenshot' ? screenshotContext : stamp.getContext('2d')!;
          secret.fillStyle = secretColor;
          secret.fillRect(20, 20, 10, 10);
          const objects = [
            ...(withBlur
              ? [
                  {
                    id: 'blur',
                    seed: 3,
                    type: 'blur',
                    style,
                    rect: { x: 10, y: 10, width: 40, height: 40 },
                    strength: 12,
                  },
                ]
              : []),
            ...(placement === 'inserted image'
              ? [
                  {
                    id: 'stamp',
                    seed: 1,
                    type: 'image',
                    style,
                    assetId: 'stamp',
                    rect: { x: 0, y: 0, width: 100, height: 100 },
                  },
                ]
              : []),
            {
              id: 'redact',
              seed: 2,
              type: 'redact',
              style,
              rect: { x: 20, y: 20, width: 10, height: 10 },
            },
          ];
          const output = document.createElement('canvas');
          output.width = output.height = 100;
          const ctx = output.getContext('2d')!;
          ctx.scale(0.57, 0.57);
          drawScene(
            ctx,
            screenshot,
            objects,
            undefined,
            new Map([['stamp', { id: 'stamp', source: stamp, width: 100, height: 100 }]]),
            { expandedBackground: false, previewEffects: true },
          );
          return {
            pixels: ctx.getImageData(0, 0, 100, 100).data,
            outside: [...ctx.getImageData(2, 2, 1, 1).data],
            masked: [...ctx.getImageData(14, 14, 1, 1).data],
          };
        };
        const red = render('#ff0000');
        const blue = render('#0000ff');
        let changedChannels = 0;
        for (let index = 0; index < red.pixels.length; index++)
          if (red.pixels[index] !== blue.pixels[index]) changedChannels++;
        return { changedChannels, outside: red.outside, masked: red.masked };
      },
      { root: `/@fs${process.cwd()}/src`, placement, withBlur },
    );
    expect(result.outside).toEqual([255, 255, 255, 255]);
    expect(result.masked).toEqual([0, 0, 0, 255]);
    expect(result.changedChannels, 'Secret pixels must not affect any preview edge pixel').toBe(0);
  });
}
