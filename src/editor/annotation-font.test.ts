import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LABEL_FONT_FAMILY } from '../core/label-layout';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('bundled annotation typography', () => {
  it('uses the same Playpen Sans family for measured labels and canvas text', () => {
    expect(LABEL_FONT_FAMILY.split(',')[0]).toBe('"Playpen Sans"');
  });

  it('does not release editor startup until both normal and bold annotation weights load', async () => {
    const requests: { font: string; text: string; resolve: (fonts: unknown[]) => void }[] = [];
    // FontFaceSet is a native browser boundary unavailable in Vitest's Node runtime.
    vi.stubGlobal('document', {
      fonts: {
        load: (font: string, text: string) =>
          new Promise<unknown[]>((resolve) => requests.push({ font, text, resolve })),
      },
    });
    const { loadAnnotationFonts } = await import('./annotation-font');
    let ready = false;
    const first = loadAnnotationFonts();
    expect(loadAnnotationFonts()).toBe(first);
    const completion = first.then(() => {
      ready = true;
    });
    expect(requests.map((request) => request.font)).toEqual([
      '500 24px "Playpen Sans"',
      '700 24px "Playpen Sans"',
    ]);
    expect(requests[0]!.text).toContain('Tiếng Việt');
    requests[0]!.resolve([{ status: 'loaded' }]);
    await Promise.resolve();
    expect(ready).toBe(false);
    requests[1]!.resolve([{ status: 'loaded' }]);
    await completion;
    expect(ready).toBe(true);
  });

  it('rejects a missing bundled face rather than caching fallback text geometry', async () => {
    vi.stubGlobal('document', { fonts: { load: async () => [] } });
    const { loadAnnotationFonts } = await import('./annotation-font');
    await expect(loadAnnotationFonts()).rejects.toThrow('annotation font');
  });

  it('preserves native font-loading failures so bootstrap can show its recovery message', async () => {
    vi.stubGlobal('document', {
      fonts: {
        load: async () => {
          throw new Error('Font decoding failed');
        },
      },
    });
    const { loadAnnotationFonts } = await import('./annotation-font');
    await expect(loadAnnotationFonts()).rejects.toThrow('Font decoding failed');
  });
});
