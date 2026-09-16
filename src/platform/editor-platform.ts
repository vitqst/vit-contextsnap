import type { ObjectStyle } from '../core/model';
import type { CaptureRecord, RecentRecord } from './types';

/** The editor owns image editing; its host owns operating-system and browser actions. */
export interface EditorPlatform {
  loadDrawingStyle(): Promise<unknown>;
  saveDrawingStyle(style: ObjectStyle): Promise<void>;
  copyImage(png: Promise<Blob>): Promise<void>;
  /** Explicit user-triggered image paste in native hosts whose WebView omits image files. */
  readClipboardImage?(): Promise<Blob | null>;
  /** A canceled Save As dialog returns false and must not mark the document as exported. */
  saveImage(png: Blob, filename: string): Promise<boolean>;
  confirmReplace(): Promise<boolean>;
  saveLabel: string;
  saveSuccessMessage: string;
  captureScreenshot?(): Promise<CaptureRecord | null>;
  returnToWebsite?(source: { url: string; allowCaptureOpener: boolean }): Promise<void>;
  /** Desktop quit requests; closing to the tray is handled by the native host. */
  watchClose?(shouldConfirm: () => boolean, onError: (error: unknown) => void): Promise<() => void>;
  watchCapture?(onCapture: () => void): Promise<() => void>;
  saveRecent?(record: RecentRecord): Promise<void>;
}

export function parseDrawingStyle(saved: unknown): ObjectStyle | null {
  if (
    !saved ||
    typeof saved !== 'object' ||
    !('color' in saved) ||
    typeof saved.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(saved.color) ||
    !('width' in saved) ||
    typeof saved.width !== 'number' ||
    !Number.isFinite(saved.width) ||
    saved.width < 1 ||
    saved.width > 16 ||
    !('sketch' in saved) ||
    typeof saved.sketch !== 'boolean'
  )
    return null;
  return {
    color: saved.color,
    width: saved.width,
    sketch: saved.sketch,
    shadow: 'shadow' in saved && typeof saved.shadow === 'boolean' ? saved.shadow : true,
    shadowKind: 'shadowKind' in saved && saved.shadowKind === 'hard' ? 'hard' : 'soft',
  };
}

/** Preserve clipboard activation and distinguish a canceled save from a successful export. */
export async function exportPng(
  platform: Pick<EditorPlatform, 'copyImage' | 'saveImage'>,
  action: 'copy' | 'save',
  pending: Promise<Blob>,
  filename: string,
): Promise<Blob | null> {
  try {
    if (action === 'copy') await platform.copyImage(pending);
    const png = await pending;
    if (action === 'save' && !(await platform.saveImage(png, filename))) return null;
    return png;
  } catch (cause) {
    // Clipboard failures may happen before the pending renderer finishes.
    await pending.catch(() => undefined);
    throw cause;
  }
}
