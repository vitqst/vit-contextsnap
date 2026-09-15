import { test, expect } from './extension';

for (const entry of ['editor', 'popup'] as const) {
  test(`${entry} starts without cross-world module preloads`, async ({
    page,
    context,
    extensionId,
  }) => {
    const preloadWarnings: string[] = [];
    const scriptErrors: string[] = [];
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    // Browser resource warnings are Log entries, not necessarily console API calls.
    const session = await context.newCDPSession(page);
    session.on('Log.entryAdded', ({ entry: message }) => {
      if (
        /cross-world extension resource mismatch|preloaded using link preload/i.test(message.text)
      )
        preloadWarnings.push(message.text);
    });
    await session.send('Log.enable');

    await page.goto(`chrome-extension://${extensionId}/${entry}.html`);
    const readyButton = page
      .getByRole('button', {
        name: entry === 'editor' ? 'Open image' : 'Capture visible page',
        exact: true,
      })
      .and(page.locator('button'));
    for (const navigation of ['initial load', 'reload']) {
      if (navigation === 'reload') await page.reload();
      await expect(readyButton).toBeVisible();
      expect(preloadWarnings, `${entry}: ${navigation}`).toEqual([]);
      await expect(
        page.locator('link[rel~="modulepreload"], link[rel~="preload"][as="script"]'),
      ).toHaveCount(0);
      expect(scriptErrors, `${entry}: ${navigation}`).toEqual([]);
    }
    await session.detach();
  });
}
