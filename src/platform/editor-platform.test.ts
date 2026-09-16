import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STYLE } from '../core/model';
import { chromeEditorPlatform } from './chrome-editor-platform';
import { exportPng, parseDrawingStyle } from './editor-platform';

afterEach(() => vi.unstubAllGlobals());

describe('editor platform exports', () => {
  it('reports cancellation without a completed export', async () => {
    const png = new Blob(['image'], { type: 'image/png' });
    const result = await exportPng(
      { copyImage: async () => {}, saveImage: async () => false },
      'save',
      Promise.resolve(png),
      'capture.png',
    );
    expect(result).toBeNull();
  });

  it('returns the PNG only after the platform saves it successfully', async () => {
    const png = new Blob(['image'], { type: 'image/png' });
    const result = await exportPng(
      {
        copyImage: async () => {},
        saveImage: async (blob, filename) => {
          expect(blob).toBe(png);
          expect(filename).toBe('capture.png');
          return true;
        },
      },
      'save',
      Promise.resolve(png),
      'capture.png',
    );
    expect(result).toBe(png);
  });

  it('starts clipboard writing before rendering finishes to preserve browser activation', async () => {
    let copied = false;
    const png = new Blob(['image'], { type: 'image/png' });
    const pending = Promise.resolve(png);
    const result = exportPng(
      {
        copyImage: async (blob) => {
          expect(blob).toBe(pending);
          copied = true;
        },
        saveImage: async () => true,
      },
      'copy',
      pending,
      'capture.png',
    );
    expect(copied).toBe(true);
    expect(await result).toBe(png);
  });

  it('preserves save failures so the editor can keep its unsaved state', async () => {
    await expect(
      exportPng(
        {
          copyImage: async () => {},
          saveImage: async () => {
            throw new Error('Disk is full');
          },
        },
        'save',
        Promise.resolve(new Blob()),
        'capture.png',
      ),
    ).rejects.toThrow('Disk is full');
  });
});

describe('platform drawing settings', () => {
  it('supports editor startup when Chrome is not present', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(await chromeEditorPlatform.loadDrawingStyle()).toBeUndefined();
    await expect(chromeEditorPlatform.saveDrawingStyle(DEFAULT_STYLE)).resolves.toBeUndefined();
  });

  it('reads and writes the extension drawingStyle storage key', async () => {
    const saved: Record<string, unknown> = { drawingStyle: DEFAULT_STYLE };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: saved[key] }),
          set: async (values: Record<string, unknown>) => {
            Object.assign(saved, values);
          },
        },
      },
    });
    expect(await chromeEditorPlatform.loadDrawingStyle()).toEqual(DEFAULT_STYLE);
    await chromeEditorPlatform.saveDrawingStyle({ ...DEFAULT_STYLE, width: 7 });
    expect(saved.drawingStyle).toEqual({ ...DEFAULT_STYLE, width: 7 });
  });

  it('accepts legacy styles and ignores invalid settings from either platform', () => {
    expect(parseDrawingStyle({ color: '#123456', width: 5, sketch: true })).toEqual({
      color: '#123456',
      width: 5,
      sketch: true,
      shadow: true,
    });
    expect(parseDrawingStyle({ ...DEFAULT_STYLE, width: Number.NaN })).toBeNull();
    expect(parseDrawingStyle({ ...DEFAULT_STYLE, width: 50 })).toBeNull();
    expect(parseDrawingStyle({ ...DEFAULT_STYLE, color: 'red' })).toBeNull();
    expect(parseDrawingStyle(null)).toBeNull();
  });
});
