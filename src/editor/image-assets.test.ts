import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageAssetStore, MAX_ASSET_PIXELS, MAX_ASSET_BYTES } from './image-assets';

function bitmap(width = 200, height = 100): ImageBitmap {
  return { width, height, close: vi.fn() };
}

afterEach(() => vi.unstubAllGlobals());

describe('image asset session', () => {
  it('decodes a file once and retains a ready shared asset until disposal', async () => {
    const source = bitmap();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(source));
    const store = new ImageAssetStore();
    const asset = await store.add(new Blob(['png'], { type: 'image/png' }));
    expect(store.assets.get(asset.id)).toEqual({ id: asset.id, source, width: 200, height: 100 });
    expect(source.close).not.toHaveBeenCalled();
    store.dispose();
    store.dispose();
    expect(store.assets.size).toBe(0);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it.each(['image/svg+xml', 'image/gif', 'text/plain', ''])(
    'rejects %s before decoding',
    async (type) => {
      const decode = vi.fn();
      vi.stubGlobal('createImageBitmap', decode);
      await expect(new ImageAssetStore().add(new Blob(['bad'], { type }))).rejects.toThrow(
        'PNG, JPEG, or WebP',
      );
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it('rejects oversized files before allocating decoded pixels', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    const file = new Blob([new Uint8Array(MAX_ASSET_BYTES + 1)], { type: 'image/png' });
    await expect(new ImageAssetStore().add(file)).rejects.toThrow('20 MB');
    expect(decode).not.toHaveBeenCalled();
  });

  it('enforces a total pixel budget while preserving existing assets', async () => {
    const first = bitmap(4000, MAX_ASSET_PIXELS / 4000);
    const extra = bitmap(1, 1);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(extra),
    );
    const store = new ImageAssetStore();
    const asset = await store.add(new Blob(['png'], { type: 'image/png' }));
    await expect(store.add(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow(
      '16 megapixels',
    );
    expect(store.assets.get(asset.id)?.source).toBe(first);
    expect(extra.close).toHaveBeenCalledOnce();
    expect(first.close).not.toHaveBeenCalled();
  });

  it('closes a late decode after its editor session has been replaced', async () => {
    let resolve!: (value: ImageBitmap) => void;
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise<ImageBitmap>((done) => {
          resolve = done;
        }),
    );
    const store = new ImageAssetStore();
    const pending = store.add(new Blob(['png'], { type: 'image/png' }));
    store.dispose();
    const late = bitmap();
    resolve(late);
    await expect(pending).rejects.toThrow('closed');
    expect(store.assets.size).toBe(0);
    expect(late.close).toHaveBeenCalledOnce();
  });

  it('reports corrupt images without adding an asset', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    const store = new ImageAssetStore();
    await expect(store.add(new Blob(['bad'], { type: 'image/webp' }))).rejects.toThrow(
      'could not be opened',
    );
    expect(store.assets.size).toBe(0);
  });

  it('rejects invalid decoded dimensions and releases the bitmap', async () => {
    const source = bitmap(0, 10);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(source));
    await expect(
      new ImageAssetStore().add(new Blob(['bad'], { type: 'image/jpeg' })),
    ).rejects.toThrow('readable pixels');
    expect(source.close).toHaveBeenCalledOnce();
  });
});
