import { describe, expect, it } from 'vitest';
import { previewSize } from './preview';

describe('preview raster size', () => {
  it('matches displayed physical pixels when zoomed out', () => {
    expect(previewSize(1920, 1080, 0.58, 1)).toEqual({ width: 1114, height: 626 });
    expect(previewSize(1920, 1080, 0.4, 2)).toEqual({ width: 1536, height: 864 });
    expect(previewSize(1920, 1080, 0.5, 2)).toEqual({ width: 1920, height: 1080 });
  });

  it('never allocates more pixels than the original even at extreme zoom and display DPI', () => {
    expect(previewSize(8000, 4000, 4, 3)).toEqual({ width: 8000, height: 4000 });
    expect(previewSize(1, 1, 0.01, 1)).toEqual({ width: 1, height: 1 });
  });

  it('uses ordinary display density when the host provides an invalid density', () => {
    for (const ratio of [0, -1, NaN, Infinity])
      expect(previewSize(1920, 1080, 0.5, ratio)).toEqual({ width: 960, height: 540 });
  });
});
