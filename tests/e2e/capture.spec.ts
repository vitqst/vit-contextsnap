import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Page, Worker } from '@playwright/test';
import { test, expect, downloadPng, inspectPng } from './extension';

const run = promisify(execFile);
const nativeInputEnabled =
  process.env.CONTEXTSNAP_NATIVE_INPUT === '1' &&
  process.env.CONTEXTSNAP_HEADED === '1' &&
  Boolean(process.env.CONTEXTSNAP_TEST_DISPLAY) &&
  process.env.CONTEXTSNAP_TEST_DISPLAY === process.env.DISPLAY;

/** Native keys are required to grant activeTab; renderer-dispatched keys do not substitute. */
async function invokeCapture(page: Page, worker: Worker, commandName: string): Promise<void> {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  const shortcut = commands.find((command) => command.name === commandName)?.shortcut;
  expect(shortcut, `Chrome must assign the default shortcut for ${commandName}`).toBeTruthy();
  let windows: string[] = [];
  await expect
    .poll(async () => {
      const result = await run('xdotool', [
        'search',
        '--onlyvisible',
        '--name',
        'ContextSnap capture fixture',
      ]).catch(() => ({ stdout: '' }));
      windows = result.stdout.trim().split(/\s+/).filter(Boolean);
      return windows.length;
    })
    .toBe(1);
  await run('xdotool', ['windowfocus', '--sync', windows[0]!]);
  await alignNativeViewport(page, worker);
  // Native capture can fail before Chrome's first compositor readback on a cold CI browser.
  // Wait for a rendered surface, then exercise the real shortcut and extension PNG below.
  await page.screenshot({ timeout: 5_000 });
  await run('xdotool', ['key', '--clearmodifiers', shortcut!.toLowerCase()]);
}

/** Playwright estimates native window decorations differently from bare Xvfb. Chrome's
 * capture surface can therefore exceed the emulated viewport; align both before capture. */
async function alignNativeViewport(page: Page, worker: Worker): Promise<void> {
  const expected = page.viewportSize();
  if (!expected) throw new Error('Native capture tests require an explicit viewport size');
  const tabId = await worker.evaluate(async (viewport) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined || tab.width === undefined || tab.height === undefined) {
      throw new Error('The native capture tab geometry is unavailable');
    }
    const window = await chrome.windows.get(tab.windowId);
    if (window.width === undefined || window.height === undefined) {
      throw new Error('The native capture window geometry is unavailable');
    }
    if (tab.width !== viewport.width || tab.height !== viewport.height) {
      await chrome.windows.update(window.id!, {
        width: window.width + viewport.width - tab.width,
        height: window.height + viewport.height - tab.height,
      });
    }
    return tab.id;
  }, expected);
  await expect
    .poll(
      () =>
        worker.evaluate(async (id) => {
          const tab = await chrome.tabs.get(id);
          return { width: tab.width, height: tab.height };
        }, tabId),
      { message: 'Chrome native tab viewport must match the requested capture size' },
    )
    .toEqual(expected);
  await expect
    .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })), {
      message: 'The emulated page viewport must remain unchanged after native window sizing',
    })
    .toEqual(expected);
}

test.describe('native Chrome capture commands', () => {
  test.skip(
    !nativeInputEnabled,
    'Requires the isolated Xvfb command documented in tests/README.md; no permission bypass is used.',
  );

  test('visible capture opens the real screenshot in an editor tab', async ({
    page,
    context,
    extensionId,
    serviceWorker,
  }, testInfo) => {
    await page.goto('/capture.html');
    await page.bringToFront();
    await expect(page).toHaveTitle('ContextSnap capture fixture');
    await serviceWorker.evaluate(() => {
      const probe = {
        installedAt: Date.now(),
        hadCommandListeners: chrome.commands.onCommand.hasListeners(),
        received: [] as { command: string; at: number; tab?: chrome.tabs.Tab }[],
      };
      Object.assign(globalThis, { __contextsnapE2ECaptureProbe: probe });
      chrome.commands.onCommand.addListener((command, tab) => {
        probe.received.push({ command, at: Date.now(), tab });
      });
    });
    let editor: Page;
    try {
      [editor] = await Promise.all([
        context.waitForEvent('page', { timeout: 10_000 }),
        invokeCapture(page, serviceWorker, 'capture-visible'),
      ]);
    } catch (error) {
      // Preserve the real failure while recording which native/extension boundary was reached.
      try {
        const diagnostics = await Promise.allSettled([
          serviceWorker.evaluate(async () => ({
            probe: (globalThis as typeof globalThis & { __contextsnapE2ECaptureProbe?: unknown })
              .__contextsnapE2ECaptureProbe,
            session: await chrome.storage.session.get(null),
            commands: await chrome.commands.getAll(),
            tabs: await chrome.tabs.query({}),
            windows: await chrome.windows.getAll(),
          })),
          page.evaluate(() => ({
            url: location.href,
            viewport: { width: innerWidth, height: innerHeight },
            outer: { width: outerWidth, height: outerHeight },
            devicePixelRatio,
            hasFocus: document.hasFocus(),
            visibility: document.visibilityState,
          })),
          run('xdotool', ['getwindowfocus', 'getwindowname'], { timeout: 2_000 }),
        ]);
        await testInfo.attach('visible-capture-diagnostics.json', {
          body: JSON.stringify(
            Object.fromEntries(
              diagnostics.map((result, index) => [
                ['extension', 'page', 'nativeFocus'][index],
                result.status === 'fulfilled' ? result.value : { error: String(result.reason) },
              ]),
            ),
            null,
            2,
          ),
          contentType: 'application/json',
        });
      } catch (diagnosticError) {
        console.error('Could not attach native capture diagnostics:', diagnosticError);
      }
      throw error;
    }
    await expect(editor).toHaveURL(
      new RegExp(`chrome-extension://${extensionId}/editor.html(?:\\?capture=.*)?$`),
    );
    await expect(editor.getByTestId('drawing-canvas')).toBeVisible();
    const png = await inspectPng(editor, await downloadPng(editor), [{ x: 20, y: 20 }]);
    expect(png).toMatchObject({ width: 1440, height: 1000 });
    expect(png.pixels).toEqual([[23, 32, 51, 255]]);

    const sourceUrl = page.url();
    const sourceId = await editor.evaluate(async () => {
      const current = await chrome.tabs.getCurrent();
      if (current?.openerTabId === undefined) throw new Error('Capture has no real opener');
      return current.openerTabId;
    });
    await test.step('Back reactivates the original tab and preserves annotation and undo', async () => {
      await expect(
        editor.getByRole('button', { name: 'Back to website', exact: true }),
      ).toBeVisible({
        timeout: 1_500,
      });
      const canvas = await editor.getByTestId('drawing-canvas').boundingBox();
      if (!canvas) throw new Error('Capture canvas missing');
      await editor.keyboard.down('Shift');
      await editor.mouse.move(canvas.x + canvas.width * 0.2, canvas.y + canvas.height * 0.2);
      await editor.mouse.down();
      await editor.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.4);
      await editor.mouse.up();
      await editor.keyboard.up('Shift');
      const label = editor.getByRole('textbox', { name: 'Arrow label', exact: true });
      await label.fill('Original note');
      await label.blur();
      await editor.mouse.dblclick(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.3);
      await editor.getByRole('textbox', { name: 'Edit label', exact: true }).fill('Keep this note');
      const pageCount = context.pages().length;
      await editor.getByRole('button', { name: 'Back to website', exact: true }).click();
      await expect
        .poll(() =>
          serviceWorker.evaluate(async () => {
            const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            return active?.id;
          }),
        )
        .toBe(sourceId);
      expect(context.pages()).toHaveLength(pageCount);
      expect(editor.isClosed()).toBe(false);
      await editor.bringToFront();
      await expect(editor.getByTestId('object-count')).toHaveText('1 object');
      await expect(label).toHaveValue('Keep this note');
      await editor.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(label).toHaveValue('Original note');
      await editor.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect(label).toHaveValue('Keep this note');
    });

    await test.step('Recent ignores even a readable matching incidental opener', async () => {
      const recentId = await editor.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('contextsnap-captures', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<string>((resolve, reject) => {
            const request = database.transaction('recent').objectStore('recent').getAllKeys();
            request.onsuccess = () => resolve(String(request.result[0]));
            request.onerror = () => reject(request.error);
          });
        } finally {
          database.close();
        }
      });
      const [recentEditor] = await Promise.all([
        context.waitForEvent('page'),
        editor.evaluate(
          ({ sourceId, recentId }) =>
            chrome.tabs.create({
              url: chrome.runtime.getURL(`editor.html?recent=${recentId}`),
              openerTabId: sourceId,
            }),
          { sourceId, recentId },
        ),
      ]);
      await expect(recentEditor.getByTestId('drawing-canvas')).toBeVisible();
      expect(
        await recentEditor.evaluate(async (id) => (await chrome.tabs.get(id)).url, sourceId),
      ).toBe(sourceUrl);
      const [website] = await Promise.all([
        context.waitForEvent('page'),
        recentEditor.getByRole('button', { name: 'Back to website', exact: true }).click(),
      ]);
      await expect(website).toHaveURL(sourceUrl);
      expect(recentEditor.isClosed()).toBe(false);
    });

    await test.step('changed and closed original tabs reopen the saved URL without losing work', async () => {
      await page.goto(`${sourceUrl}?changed=1`);
      await editor.bringToFront();
      const [changedFallback] = await Promise.all([
        context.waitForEvent('page'),
        editor.getByRole('button', { name: 'Back to website', exact: true }).click(),
      ]);
      await expect(changedFallback).toHaveURL(sourceUrl);
      await expect(page).toHaveURL(`${sourceUrl}?changed=1`);
      await page.close();
      await editor.bringToFront();
      const [closedFallback] = await Promise.all([
        context.waitForEvent('page'),
        editor.getByRole('button', { name: 'Back to website', exact: true }).click(),
      ]);
      await expect(closedFallback).toHaveURL(sourceUrl);
      expect(editor.isClosed()).toBe(false);
      await editor.bringToFront();
      await expect(editor.getByTestId('object-count')).toHaveText('1 object');
      await expect(editor.getByRole('textbox', { name: 'Arrow label', exact: true })).toHaveValue(
        'Keep this note',
      );
    });
  });

  test('area capture excludes the picker overlay and Escape cancels a new selection', async ({
    page,
    context,
    extensionId,
    serviceWorker,
  }, testInfo) => {
    await page.goto('/capture.html');
    await page.bringToFront();
    await expect(page).toHaveTitle('ContextSnap capture fixture');
    const pageModal = page.locator('#page-modal');
    await pageModal.evaluate((dialog: HTMLDialogElement) => dialog.showModal());
    const sample = await page.locator('.sample').boundingBox();
    if (!sample) throw new Error('The fixture capture target is not visible');
    await invokeCapture(page, serviceWorker, 'capture-area');
    const selector = page.locator('#contextsnap-area-selector');
    await expect(selector)
      .toBeVisible()
      .catch(async (error: unknown) => {
        const state = await serviceWorker.evaluate(async () => ({
          session: await chrome.storage.session.get(null),
          commands: await chrome.commands.getAll(),
          tabs: await chrome.tabs.query({ active: true, currentWindow: true }),
        }));
        await testInfo.attach('capture-session.json', {
          body: JSON.stringify(state, null, 2),
          contentType: 'application/json',
        });
        throw error;
      });
    await expect(pageModal).toHaveJSProperty('open', true);
    // Whole-pixel selection bounds avoid the intentional outward rounding of fractional regions.
    const start = { x: Math.ceil(sample.x + 200), y: Math.ceil(sample.y + 70) };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 300, start.y + 80, { steps: 10 });
    await page.mouse.up();
    const pendingEditor = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    await expect(selector).toHaveCount(0);
    await expect(pageModal).toHaveJSProperty('open', true);
    const editor = await pendingEditor;
    await expect(editor).toHaveURL(
      new RegExp(`chrome-extension://${extensionId}/editor.html(?:\\?capture=.*)?$`),
    );
    await expect(editor.getByTestId('drawing-canvas')).toBeVisible();
    const png = await inspectPng(editor, await downloadPng(editor), [
      { x: 5, y: 5 },
      { x: 150, y: 40 },
      { x: 295, y: 75 },
    ]);
    expect(png).toMatchObject({ width: 300, height: 80 });
    expect(png.pixels).toEqual([
      [37, 99, 235, 255],
      [37, 99, 235, 255],
      [37, 99, 235, 255],
    ]);

    await page.bringToFront();
    await invokeCapture(page, serviceWorker, 'capture-area');
    await expect(selector).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(selector).toHaveCount(0);
    await expect(pageModal).toHaveJSProperty('open', true);
  });
});
