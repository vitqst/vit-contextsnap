import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkImageSize, exportFilename, flattenImage } from './image';

describe('image export boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects oversized expanded scenes before allocating even with a small explicit crop', async () => {
    const allocate = vi.fn(() => {
      throw new Error('Canvas allocated before validation');
    });
    vi.stubGlobal('document', { createElement: allocate });
    await expect(
      flattenImage({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement, {
        version: 1,
        crop: { x: 0, y: 0, width: 20, height: 20 },
        objects: [
          {
            id: 'oversized',
            seed: 1,
            type: 'rectangle',
            style: { color: '#ff0000', width: 4, sketch: false },
            rect: { x: 0, y: 0, width: 20000, height: 100 },
          },
        ],
      }),
    ).rejects.toThrow('too large');
    expect(allocate).not.toHaveBeenCalled();
  });
  it('rejects oversized canvases before allocation', () => {
    expect(() => checkImageSize(20000, 100)).toThrow('too large');
    expect(() => checkImageSize(8000, 8000)).toThrow('too large');
    expect(() => checkImageSize(0, 100)).toThrow();
    expect(() => checkImageSize(1440, 900)).not.toThrow();
  });
  it('does not put URL query strings or credentials in downloaded filenames', () => {
    expect(
      exportFilename({
        url: 'https://user:secret@example.com/page?token=secret',
        createdAt: '2026-09-15T10:00:00Z',
      }),
    ).toBe('example.com_2026-09-15-10-00-00.png');
  });
  it('supports imported images and malformed timestamps', () => {
    expect(exportFilename({ url: '', createdAt: 'bad' })).toBe('contextsnap_capture.png');
  });
});
