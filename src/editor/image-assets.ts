export const MAX_ASSET_PIXELS = 16_000_000;
export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export interface ImageAsset {
  readonly id: string;
  readonly source: ImageBitmap;
  readonly width: number;
  readonly height: number;
}

export type ImageAssets = ReadonlyMap<string, ImageAsset>;

/** One editor session owns decoded pixels; document history only keeps asset IDs. */
export class ImageAssetStore {
  private readonly entries = new Map<string, ImageAsset>();
  private pixels = 0;
  private disposed = false;

  get assets(): ImageAssets {
    return this.entries;
  }

  async add(file: Blob): Promise<ImageAsset> {
    if (this.disposed) throw new Error('This image session has closed.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new Error('Choose a PNG, JPEG, or WebP image.');
    if (file.size > MAX_ASSET_BYTES)
      throw new Error('This file is too large. Choose an image smaller than 20 MB.');
    let source: ImageBitmap;
    try {
      source = await createImageBitmap(file);
    } catch {
      throw new Error('This image could not be opened. Try a PNG, JPEG, or WebP file.');
    }
    try {
      if (this.disposed) throw new Error('This image session has closed.');
      const { width, height } = source;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1)
        throw new Error('This image has no readable pixels. Choose another image.');
      if (width > 16384 || height > 16384 || this.pixels + width * height > MAX_ASSET_PIXELS)
        throw new Error(
          'Inserted images are limited to 16 megapixels in total (including undo history). Use smaller images or start a new screenshot.',
        );
      const asset = { id: crypto.randomUUID(), source, width, height };
      this.entries.set(asset.id, asset);
      this.pixels += width * height;
      return asset;
    } catch (error) {
      source.close();
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const asset of this.entries.values()) asset.source.close();
    this.entries.clear();
    this.pixels = 0;
  }
}
