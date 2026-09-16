import { test, expect, capture } from './bridge';

test('desktop has no scrollbars and the camera covers the complete workspace', async ({
  desktop: page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await capture(page);
  const root = await page.evaluate(() => ({
    overflow: getComputedStyle(document.documentElement).overflow,
    height: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(root.overflow).toBe('hidden');
  expect(root.scrollHeight).toBe(root.height);
  expect(root.scrollWidth).toBe(root.width);
  for (let i = 0; i < 9; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const scrolling = await page.locator('.stage-scroll').evaluate((stage) => {
    return {
      overflow: getComputedStyle(stage).overflow,
      scrollbar: getComputedStyle(stage).scrollbarWidth,
      webkitScrollbar: getComputedStyle(stage, '::-webkit-scrollbar').display,
    };
  });
  expect(scrolling.overflow).toBe('hidden');
  expect(scrolling.scrollbar === 'none' || scrolling.webkitScrollbar === 'none').toBe(true);
  expect(await page.locator('.stage-scroll').boundingBox()).toEqual(
    await page.locator('.editor-workspace').boundingBox(),
  );
  const canvas = page.locator('.screenshot-background');
  const before = (await canvas.boundingBox())!;
  await page.mouse.move(450, 450);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await canvas.boundingBox())!.y).toBeLessThan(before.y);
});
