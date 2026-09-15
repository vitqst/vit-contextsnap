import type { EditorDocument } from '../core/model';
import type { CaptureRecord } from '../platform/types';
import { drawScene } from '../editor/render';
import type { ImageAssets } from '../editor/image-assets';

export const MAX_IMAGE_PIXELS = 32_000_000;
export const MAX_IMAGE_SIDE = 16384;

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

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    checkImageSize(image.naturalWidth, image.naturalHeight);
    return image;
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) throw error;
    throw new Error('This image could not be opened. Try a PNG, JPEG, or WebP file.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function flattenImage(
  image: HTMLImageElement,
  doc: EditorDocument,
  assets?: ImageAssets,
): Promise<Blob> {
  const crop = doc.crop ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The image renderer could not start. Reopen the editor and try again.');
  ctx.translate(-crop.x, -crop.y);
  drawScene(ctx, image, doc.objects, crop, assets);
  // The independent export canvas contains no selection handles or editable scene metadata.
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('PNG export failed. Try a smaller crop.')),
      'image/png',
    );
  });
}

export function exportFilename(capture: Pick<CaptureRecord, 'url' | 'createdAt'>): string {
  let prefix = 'contextsnap';
  try {
    prefix = new URL(capture.url).hostname || prefix;
  } catch {
    /* Local image. */
  }
  const date = new Date(capture.createdAt);
  const timestamp = Number.isNaN(date.getTime())
    ? 'capture'
    : date.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `${prefix.replace(/[^a-zA-Z0-9._-]/g, '_')}_${timestamp}.png`;
}

export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Start the ClipboardItem during the click, preserving the user's clipboard gesture. */
export async function copyImage(blob: Promise<Blob>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard access is unavailable. Use Download PNG to save your image.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
