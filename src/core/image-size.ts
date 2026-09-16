export const MAX_IMAGE_PIXELS = 32_000_000;
export const MAX_IMAGE_SIDE = 16384;

/** Validate every full-resolution raster before allocating its backing pixels. */
export function checkImageSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('This image has no readable pixels. Choose another image.');
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      'This image is too large to edit safely. Use an image under 32 megapixels and 16,384 pixels per side.',
    );
  }
}
