import { test, expect } from './bridge';

test('bundled Playpen Sans is loaded for Vietnamese canvas metrics before editor startup', async ({
  desktop: page,
}) => {
  const result = await page.evaluate(async (root) => {
    const { LABEL_FONT_FAMILY, measureText } = await import(`${root}/core/label-layout.ts`);
    const sample = 'Tiếng Việt: Ắằễộựđ WWW';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const metricDifferences = ['iiiiiiii', 'WWWWWWWW', 'mmmmmmmm', '0123456789', sample].map(
      (text) => {
        ctx.font = '500 24px system-ui';
        return Math.abs(measureText(text, 24) - ctx.measureText(text).width);
      },
    );
    const before = measureText(sample, 24);
    await document.fonts.ready;
    return {
      family: LABEL_FONT_FAMILY,
      faces: [...document.fonts]
        .filter((face) => face.family.replace(/["']/gu, '') === 'Playpen Sans')
        .map((face) => face.status),
      normalReady: document.fonts.check('500 24px "Playpen Sans"', sample),
      boldReady: document.fonts.check('700 24px "Playpen Sans"', sample),
      before,
      after: measureText(sample, 24),
      metricDifferences,
      fontUrls: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('PlaypenSans') && name.includes('.ttf')),
    };
  }, `/@fs${process.cwd()}/src`);
  expect(result.family).toContain('Playpen Sans');
  expect(result.faces).toEqual(['loaded']);
  expect(result.normalReady).toBe(true);
  expect(result.boldReady).toBe(true);
  expect(result.before).toBe(result.after);
  expect(Math.max(...result.metricDifferences)).toBeGreaterThan(1);
  expect(result.fontUrls).toHaveLength(1);
  expect(new URL(result.fontUrls[0]!).origin).toBe(new URL(page.url()).origin);
});

test('editor never mounts with fallback metrics while the local font is still loading', async ({
  desktop: page,
}) => {
  let release: (() => void) | undefined;
  let requested: () => void;
  const fontRequest = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/*.ttf', async (route) => {
    await new Promise<void>((resume) => {
      release = resume;
      requested();
    });
    await route.continue();
  });
  const navigation = page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await fontRequest;
    await expect(
      page.getByRole('heading', { name: 'Make your point. With a picture.' }),
    ).toHaveCount(0);
    release!();
    await navigation;
    await expect(
      page.getByRole('heading', { name: 'Make your point. With a picture.' }),
    ).toBeVisible();
  } finally {
    release?.();
    await navigation;
    await page.unroute('**/*.ttf');
  }
});
