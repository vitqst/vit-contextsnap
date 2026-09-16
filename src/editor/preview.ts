/** Preview buffers match display pixels, but never upscale the source into a larger allocation. */
export function previewSize(width: number, height: number, scale: number, pixelRatio: number) {
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const ratio = Math.min(1, scale * density);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
