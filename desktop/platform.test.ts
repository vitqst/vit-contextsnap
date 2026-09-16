import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  confirm: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: native.confirm }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: native.close,
    destroy: native.destroy,
    listen: native.listen,
  }),
}));

import { desktopPlatform } from './platform';

const keyboard = vi.hoisted(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', keyboard);
});
afterEach(() => vi.unstubAllGlobals());

describe('desktop image operations', () => {
  it('does not treat a canceled native save as an exported image', async () => {
    native.invoke.mockResolvedValue(false);
    expect(await desktopPlatform.saveImage(new Blob(['PNG']), 'example.png')).toBe(false);
    expect(native.invoke).toHaveBeenCalledWith('save_png', {
      png: [80, 78, 71],
      filename: 'example.png',
    });
  });

  it('passes flattened PNG bytes to the native clipboard', async () => {
    await desktopPlatform.copyImage(Promise.resolve(new Blob(['PNG'])));
    expect(native.invoke).toHaveBeenCalledWith('copy_png', { png: [80, 78, 71] });
  });

  it('reads native image pixels as a PNG without scaling or browser clipboard access', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    native.invoke.mockResolvedValue(png.buffer);
    const image = await desktopPlatform.readClipboardImage!();
    expect(image?.type).toBe('image/png');
    expect(new Uint8Array(await image!.arrayBuffer())).toEqual(png);
    expect(native.invoke).toHaveBeenCalledWith('read_clipboard_png', undefined);
  });

  it('treats a text-only or empty native clipboard as no image', async () => {
    native.invoke.mockResolvedValue(new ArrayBuffer(0));
    expect(await desktopPlatform.readClipboardImage!()).toBeNull();
  });

  it('keeps native clipboard failures actionable instead of silently dropping paste', async () => {
    native.invoke.mockRejectedValue('Could not read clipboard image. Copy it again and retry.');
    await expect(desktopPlatform.readClipboardImage!()).rejects.toThrow(
      'Could not read clipboard image. Copy it again and retry.',
    );
  });

  it('treats an empty capture response as cancellation', async () => {
    native.invoke.mockResolvedValue(new ArrayBuffer(0));
    expect(await desktopPlatform.captureScreenshot!()).toBeNull();
  });

  it('opens native screenshot bytes without attaching website metadata', async () => {
    native.invoke.mockResolvedValue(new Uint8Array([137, 80, 78, 71]).buffer);
    const capture = await desktopPlatform.captureScreenshot!();
    expect(capture).toMatchObject({ mode: 'screen', url: '', title: 'Desktop screenshot' });
    expect(capture?.image.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await capture!.image.arrayBuffer()))).toEqual([
      137, 80, 78, 71,
    ]);
  });

  it('keeps native capture failures visible to the editor', async () => {
    native.invoke.mockRejectedValue('Screen capture permission denied.');
    await expect(desktopPlatform.captureScreenshot!()).rejects.toThrow(
      'Screen capture permission denied.',
    );
  });

  it('falls back to defaults when local settings are corrupt', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '{invalid json' });
    expect(await desktopPlatform.loadDrawingStyle()).toBeUndefined();
  });
});

describe('tray lifecycle', () => {
  it('leaves the close button to the native hide-to-tray handler', async () => {
    native.listen.mockResolvedValue(() => {});
    await desktopPlatform.watchClose!(() => true, vi.fn());
    expect(native.close).not.toHaveBeenCalled();
    expect(native.listen).toHaveBeenCalledWith('contextsnap:quit-requested', expect.any(Function));
  });

  it('uses current unsaved state and keeps the app when Quit is canceled', async () => {
    native.listen.mockResolvedValue(() => {});
    let dirty = false;
    await desktopPlatform.watchClose!(() => dirty, vi.fn());
    dirty = true;
    native.confirm.mockResolvedValue(false);
    await native.listen.mock.calls[0]![1]();
    expect(native.confirm).toHaveBeenCalled();
    expect(native.invoke).not.toHaveBeenCalledWith('quit_app', undefined);
  });

  it('quits after explicit discard approval instead of hiding or destroying the editor', async () => {
    native.listen.mockResolvedValue(() => {});
    native.confirm.mockResolvedValue(true);
    await desktopPlatform.watchClose!(() => true, vi.fn());
    await native.listen.mock.calls[0]![1]();
    expect(native.invoke).toHaveBeenCalledWith('quit_app', undefined);
    expect(native.destroy).not.toHaveBeenCalled();
  });

  it('quits clean work without asking for discard', async () => {
    native.listen.mockResolvedValue(() => {});
    await desktopPlatform.watchClose!(() => false, vi.fn());
    await native.listen.mock.calls[0]![1]();
    expect(native.confirm).not.toHaveBeenCalled();
    expect(native.invoke).toHaveBeenCalledWith('quit_app', undefined);
  });

  it('reports a failed Quit and allows retry instead of leaving an unhandled rejection', async () => {
    native.listen.mockResolvedValue(() => {});
    const onError = vi.fn();
    await desktopPlatform.watchClose!(() => false, onError);
    native.invoke.mockRejectedValueOnce('Could not quit');
    await native.listen.mock.calls[0]![1]();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Could not quit' }));
    await native.listen.mock.calls[0]![1]();
    expect(native.invoke).toHaveBeenCalledTimes(2);
  });

  it('offers Ctrl+Q without a tray host and removes the shortcut on cleanup', async () => {
    const cleanup = vi.fn();
    native.listen.mockResolvedValue(cleanup);
    native.confirm.mockResolvedValue(false);
    const stop = await desktopPlatform.watchClose!(() => true, vi.fn());
    expect(keyboard.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    const event = { key: 'q', ctrlKey: true, metaKey: false, preventDefault: vi.fn() };
    await keyboard.addEventListener.mock.calls[0]![1](event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(native.confirm).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalled();
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(keyboard.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('routes the tray Screenshot action into the shared editor and removes the listener', async () => {
    const cleanup = vi.fn();
    native.listen.mockResolvedValue(cleanup);
    const onCapture = vi.fn();
    const stop = await desktopPlatform.watchCapture!(onCapture);
    expect(native.listen).toHaveBeenCalledWith(
      'contextsnap:capture-requested',
      expect.any(Function),
    );
    await native.listen.mock.calls[0]![1]();
    expect(onCapture).toHaveBeenCalledOnce();
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
