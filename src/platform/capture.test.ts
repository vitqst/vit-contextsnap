import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmAreaCapture,
  cropToPixels,
  isAreaCaptureRequest,
  isCaptureRequest,
  isExtensionPageSender,
  isSupportedCaptureUrl,
  startCapture,
} from './capture';

afterEach(() => vi.unstubAllGlobals());

describe('capture validation', () => {
  it('only accepts supported web pages', () => {
    expect(isSupportedCaptureUrl('https://example.com/a')).toBe(true);
    expect(isSupportedCaptureUrl('http://localhost:5173')).toBe(true);
    for (const url of [
      'chrome://settings',
      'file:///tmp/a.html',
      'data:text/html,hi',
      '',
      'https://chromewebstore.google.com/detail/a',
      'https://chrome.google.com/webstore/category/extensions',
    ]) {
      expect(isSupportedCaptureUrl(url)).toBe(false);
    }
  });

  it('rejects malformed runtime requests before invoking Chrome APIs', () => {
    expect(isCaptureRequest({ type: 'capture', mode: 'area', tabId: 12 })).toBe(true);
    expect(isCaptureRequest({ type: 'capture', mode: 'visible' })).toBe(true);
    for (const value of [
      null,
      {},
      { type: 'capture', mode: 'full' },
      { type: 'capture', mode: 'visible', tabId: -1 },
      { type: 'capture', mode: 'area', tabId: 1.5 },
    ]) {
      expect(isCaptureRequest(value)).toBe(false);
    }
  });

  it('rejects invalid and out-of-viewport area rectangles', () => {
    const valid = {
      type: 'capture-area-confirm',
      rect: { x: 10, y: 20, width: 40, height: 50 },
      viewport: { width: 800, height: 600, devicePixelRatio: 2 },
    };
    expect(isAreaCaptureRequest(valid)).toBe(true);
    for (const rect of [
      { x: -1, y: 20, width: 40, height: 50 },
      { x: 10, y: 20, width: 0, height: 50 },
      { x: 790, y: 20, width: 40, height: 50 },
      { x: 10, y: Number.NaN, width: 40, height: 50 },
    ])
      expect(isAreaCaptureRequest({ ...valid, rect })).toBe(false);
    expect(
      isAreaCaptureRequest({ ...valid, viewport: { ...valid.viewport, devicePixelRatio: 0 } }),
    ).toBe(false);
  });
});

describe('capture authority and target', () => {
  it('removes an existing area overlay before a visible capture', async () => {
    const events: string[] = [];
    const tab = { id: 10, url: 'https://example.com', windowId: 1 };
    vi.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      __contextSnapAreaCleanup: () => {
        events.push('overlay removed');
      },
    });
    vi.stubGlobal('location', { href: tab.url });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('chrome', {
      tabs: {
        get: async () => tab,
        query: async () => [tab],
        captureVisibleTab: async () => {
          events.push('screenshot');
          throw new Error('Stop after screenshot request');
        },
      },
      storage: {
        session: {
          get: async () => ({}),
          set: async () => undefined,
          remove: async () => undefined,
        },
      },
      scripting: {
        executeScript: async ({
          func,
          args = [],
        }: {
          func: (...args: unknown[]) => unknown;
          args?: unknown[];
        }) => [{ result: await func(...args), documentId: 'document-1' }],
      },
    });
    await expect(startCapture('visible', 10)).rejects.toThrow('Stop after screenshot request');
    expect(events).toEqual(['overlay removed', 'screenshot']);
  });

  it('only accepts initial requests from our own extension pages', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'contextsnap-id',
        getURL: (path: string) => `chrome-extension://contextsnap-id/${path}`,
      },
    });
    expect(
      isExtensionPageSender({
        id: 'contextsnap-id',
        url: 'chrome-extension://contextsnap-id/popup.html',
      }),
    ).toBe(true);
    expect(isExtensionPageSender({ id: 'contextsnap-id', url: 'https://example.com/' })).toBe(
      false,
    );
    expect(
      isExtensionPageSender({
        id: 'other-id',
        url: 'chrome-extension://contextsnap-id/popup.html',
      }),
    ).toBe(false);
    expect(
      isExtensionPageSender({
        id: 'contextsnap-id',
        url: 'chrome-extension://contextsnap-id.example.com/popup.html',
      }),
    ).toBe(false);
  });

  it('stops if the requested tab is no longer active', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        get: async () => ({ id: 10, url: 'https://example.com', windowId: 1 }),
        query: async () => [{ id: 11, url: 'https://another.example', windowId: 1 }],
      },
    });
    await expect(startCapture('visible', 10)).rejects.toThrow(/active tab changed/i);
  });

  it('does not accept area confirmation from an iframe or without a selection session', async () => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'contextsnap-id' },
      storage: { session: { get: async () => ({}) } },
    });
    const request = {
      type: 'capture-area-confirm' as const,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      viewport: { width: 800, height: 600, devicePixelRatio: 1 },
    };
    await expect(
      confirmAreaCapture(request, { id: 'contextsnap-id', frameId: 1, documentId: 'doc' }),
    ).rejects.toThrow(/active selection/i);
    await expect(
      confirmAreaCapture(request, {
        id: 'contextsnap-id',
        frameId: 0,
        documentId: 'doc',
        tab: { id: 1 } as chrome.tabs.Tab,
        url: 'https://example.com',
      }),
    ).rejects.toThrow(/expired/i);
  });
});

describe('area crop coordinates', () => {
  it('uses the actual screenshot ratio when browser zoom differs from device pixel ratio', () => {
    expect(
      cropToPixels(
        { x: 25, y: 40, width: 100, height: 80 },
        { width: 800, height: 600, devicePixelRatio: 2 },
        { width: 1000, height: 750 },
      ),
    ).toEqual({ x: 31, y: 50, width: 126, height: 100 });
  });

  it('keeps fractional pixels at the right and bottom edge inside the screenshot', () => {
    expect(
      cropToPixels(
        { x: 799.4, y: 599.4, width: 0.6, height: 0.6 },
        { width: 800, height: 600, devicePixelRatio: 1.25 },
        { width: 1000, height: 750 },
      ),
    ).toEqual({ x: 999, y: 749, width: 1, height: 1 });
  });

  it('rejects non-finite dimensions and excessive bitmap sizes', () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    const viewport = { width: 800, height: 600, devicePixelRatio: 1 };
    expect(() => cropToPixels(rect, viewport, { width: 0, height: 600 })).toThrow();
    expect(() => cropToPixels(rect, viewport, { width: 32768, height: 32768 })).toThrow();
  });
});
