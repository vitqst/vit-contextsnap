import { afterEach, describe, expect, it, vi } from 'vitest';
import { returnToWebsite, sourceWebsiteUrl } from './source-navigation';

const sourceUrl = 'https://example.com/review?item=1#details';

function browser() {
  const tabs = {
    getCurrent: vi.fn(async () => ({ id: 20, windowId: 2, openerTabId: 10 })),
    get: vi.fn(async () => ({ id: 10, windowId: 1, url: sourceUrl })),
    update: vi.fn(async () => ({ id: 10, windowId: 1, url: sourceUrl })),
    create: vi.fn(async () => ({ id: 30, windowId: 2 })),
  };
  const windows = { update: vi.fn(async () => ({ id: 1, focused: true })) };
  vi.stubGlobal('chrome', { tabs, windows });
  return { tabs, windows };
}

afterEach(() => vi.unstubAllGlobals());

describe('sourceWebsiteUrl', () => {
  it('normalizes web URLs without losing path, query, or fragment', () => {
    expect(sourceWebsiteUrl('HTTPS://EXAMPLE.COM:443/review?item=1#details')).toBe(sourceUrl);
    expect(sourceWebsiteUrl('http://localhost:4179')).toBe('http://localhost:4179/');
  });

  it.each([
    undefined,
    null,
    1,
    {},
    '',
    '/relative',
    'example.com',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/image.png',
    'chrome://settings',
    'chrome-extension://id/editor.html',
    'ftp://example.com/file',
    'https://',
    'https://user:password@example.com/',
    'https://user@example.com/',
    'https://example.com/\nother',
    '\thttps://example.com/',
    'https://example.com/\u0000',
    'https://example.com/\u007f',
    `https://example.com/${'x'.repeat(16_384)}`,
  ])('rejects unsafe or invalid input %#', (value) => {
    expect(sourceWebsiteUrl(value)).toBeNull();
  });
});

describe('returnToWebsite', () => {
  it('activates the exact normalized opener and focuses its current window', async () => {
    const { tabs, windows } = browser();
    await returnToWebsite({
      url: 'HTTPS://EXAMPLE.COM:443/review?item=1#details',
      allowCaptureOpener: true,
    });
    expect(tabs.get).toHaveBeenCalledWith(10);
    expect(tabs.update).toHaveBeenCalledExactlyOnceWith(10, { active: true });
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(1, { focused: true });
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.com/another',
    'https://example.com/review?item=2#details',
    'https://example.com/review?item=1#other',
    'https://example.com.evil.test/review?item=1#details',
    'http://example.com/review?item=1#details',
    '',
  ])('opens the saved URL without changing an opener at %s', async (url) => {
    const { tabs, windows } = browser();
    tabs.get.mockResolvedValue({ id: 10, windowId: 1, url });
    await returnToWebsite({ url: sourceUrl, allowCaptureOpener: true });
    expect(tabs.update).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledExactlyOnceWith({
      url: sourceUrl,
      active: true,
      windowId: 2,
    });
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(2, { focused: true });
  });

  it('does not reuse an opener with a different pending navigation', async () => {
    const { tabs } = browser();
    tabs.get.mockResolvedValue({
      id: 10,
      windowId: 1,
      url: sourceUrl,
      pendingUrl: 'https://example.com/changed',
    } as Awaited<ReturnType<typeof tabs.get>>);
    await returnToWebsite({ url: sourceUrl, allowCaptureOpener: true });
    expect(tabs.update).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledOnce();
  });

  it('does not use an incidental opener for a Recent export', async () => {
    const { tabs } = browser();
    await returnToWebsite({ url: sourceUrl, allowCaptureOpener: false });
    expect(tabs.get).not.toHaveBeenCalled();
    expect(tabs.update).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledOnce();
  });

  it('opens a fallback when Chrome no longer reports an opener', async () => {
    const { tabs } = browser();
    tabs.getCurrent.mockResolvedValue({ id: 20, windowId: 2 } as Awaited<
      ReturnType<typeof tabs.getCurrent>
    >);
    await returnToWebsite({ url: sourceUrl, allowCaptureOpener: true });
    expect(tabs.get).not.toHaveBeenCalled();
    expect(tabs.create).toHaveBeenCalledOnce();
  });

  it.each(['get', 'update'] as const)('handles the source closing during %s', async (method) => {
    const { tabs } = browser();
    tabs[method].mockRejectedValue(new Error('No tab with id: 10.'));
    await returnToWebsite({ url: sourceUrl, allowCaptureOpener: true });
    expect(tabs.create).toHaveBeenCalledOnce();
  });

  it.each(['getCurrent', 'get', 'update'] as const)(
    'propagates unrelated %s failures without opening a duplicate',
    async (method) => {
      const { tabs } = browser();
      tabs[method].mockRejectedValue(new Error('Tabs cannot be edited right now'));
      await expect(returnToWebsite({ url: sourceUrl, allowCaptureOpener: true })).rejects.toThrow(
        'Tabs cannot be edited right now',
      );
      expect(tabs.create).not.toHaveBeenCalled();
    },
  );

  it('preserves a focus failure without retrying or creating another tab', async () => {
    const { tabs, windows } = browser();
    windows.update.mockRejectedValue(new Error('Window focus failed'));
    await expect(returnToWebsite({ url: sourceUrl, allowCaptureOpener: true })).rejects.toThrow(
      'Window focus failed',
    );
    expect(windows.update).toHaveBeenCalledOnce();
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('propagates fallback creation failures', async () => {
    const { tabs, windows } = browser();
    tabs.create.mockRejectedValue(new Error('Could not create tab'));
    await expect(returnToWebsite({ url: sourceUrl, allowCaptureOpener: false })).rejects.toThrow(
      'Could not create tab',
    );
    expect(windows.update).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs before touching Chrome', async () => {
    const { tabs } = browser();
    await expect(
      returnToWebsite({ url: 'javascript:alert(1)', allowCaptureOpener: true }),
    ).rejects.toThrow(/website URL/i);
    expect(tabs.getCurrent).not.toHaveBeenCalled();
    expect(tabs.create).not.toHaveBeenCalled();
  });
});
