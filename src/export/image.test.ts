import { describe, expect, it } from 'vitest';
import { checkImageSize, exportFilename } from './image';

describe('image export boundaries', () => {
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
