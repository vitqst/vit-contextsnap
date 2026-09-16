import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { EditorPlatform } from '../src/platform/editor-platform';

const STYLE_KEY = 'contextsnap.drawingStyle';

async function nativeCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error(String(cause));
  }
}

async function pngBytes(png: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await png.arrayBuffer()));
}

export const desktopPlatform: EditorPlatform = {
  async loadDrawingStyle() {
    try {
      const saved = localStorage.getItem(STYLE_KEY);
      return saved ? (JSON.parse(saved) as unknown) : undefined;
    } catch {
      return undefined;
    }
  },
  async saveDrawingStyle(style) {
    localStorage.setItem(STYLE_KEY, JSON.stringify(style));
  },
  async copyImage(pending) {
    await nativeCall('copy_png', { png: await pngBytes(await pending) });
  },
  async readClipboardImage() {
    const bytes = await nativeCall<ArrayBuffer>('read_clipboard_png');
    return bytes.byteLength ? new Blob([bytes], { type: 'image/png' }) : null;
  },
  async saveImage(png, filename) {
    return nativeCall<boolean>('save_png', { png: await pngBytes(png), filename });
  },
  confirmReplace: () =>
    confirm('Replace this screenshot? Copy or save it first to keep your current work.', {
      title: 'Replace screenshot',
      kind: 'warning',
      okLabel: 'Replace',
      cancelLabel: 'Keep editing',
    }),
  saveLabel: 'Save PNG',
  saveSuccessMessage: 'PNG saved.',
  async captureScreenshot() {
    const bytes = await nativeCall<ArrayBuffer>('capture_screenshot');
    if (!bytes.byteLength) return null;
    return {
      version: 1,
      id: crypto.randomUUID(),
      image: new Blob([bytes], { type: 'image/png' }),
      width: 0,
      height: 0,
      title: 'Desktop screenshot',
      url: '',
      createdAt: new Date().toISOString(),
      mode: 'screen',
    };
  },
  async watchCapture(onCapture) {
    return getCurrentWindow().listen('contextsnap:capture-requested', onCapture);
  },
  async watchClose(shouldConfirm, onError) {
    const appWindow = getCurrentWindow();
    let asking = false;
    const requestQuit = async () => {
      if (asking) return;
      asking = true;
      try {
        if (
          shouldConfirm() &&
          !(await confirm('Quit without exporting? Your editable screenshot will be discarded.', {
            title: 'Unsaved screenshot',
            kind: 'warning',
            okLabel: 'Discard and quit',
            cancelLabel: 'Keep editing',
          }))
        )
          return;
        await nativeCall('quit_app');
      } catch (cause) {
        onError(cause);
      } finally {
        asking = false;
      }
    };
    const unlisten = await appWindow.listen('contextsnap:quit-requested', requestQuit);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        return requestQuit();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => {
      window.removeEventListener('keydown', shortcut);
      unlisten();
    };
  },
};
