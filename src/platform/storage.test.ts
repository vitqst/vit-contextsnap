import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecent,
  deleteRecent,
  getCapture,
  listRecent,
  putCapture,
  saveRecent,
  takeCapture,
} from './storage';
import type { CaptureRecord, RecentRecord } from './types';

function capture(id: string, createdAt = new Date().toISOString()): CaptureRecord {
  return {
    version: 1,
    id,
    image: new Blob(['pixels'], { type: 'image/png' }),
    width: 10,
    height: 10,
    title: 'A screenshot',
    url: 'https://example.com',
    createdAt,
    mode: 'visible',
  };
}

function recent(id: string, exportedAt = new Date().toISOString()): RecentRecord {
  return { ...capture(id), exportedAt };
}

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local capture storage', () => {
  it('hands the original image to an editor only once, even for concurrent loads', async () => {
    await putCapture(capture('capture-one'));
    const results = await Promise.all([takeCapture('capture-one'), takeCapture('capture-one')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await getCapture('capture-one')).toBeUndefined();
    expect(await results.find(Boolean)?.image.text()).toBe('pixels');
  });

  it('only keeps the latest 20 flattened exports', async () => {
    for (let i = 0; i < 23; i++) {
      await saveRecent(recent(`image-${i}`, new Date(Date.now() + i * 1000).toISOString()));
    }
    const items = await listRecent();
    expect(items).toHaveLength(20);
    expect(items[0]?.id).toBe('image-22');
    expect(items.at(-1)?.id).toBe('image-3');
    await deleteRecent('image-22');
    expect(await listRecent()).toHaveLength(19);
    await clearRecent();
    expect(await listRecent()).toEqual([]);
  });

  it('drops abandoned originals after an hour and bounds pending captures', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await putCapture(capture('expired', new Date(now - 61 * 60 * 1000).toISOString()));
    expect(await getCapture('expired')).toBeUndefined();
    for (let i = 0; i < 8; i++) {
      await putCapture(capture(`pending-${i}`, new Date(now + i).toISOString()));
    }
    expect(await getCapture('pending-0')).toBeUndefined();
    expect(await getCapture('pending-7')).toBeDefined();
    vi.restoreAllMocks();
  });

  it('enforces one 100 MB budget for original captures and recent exports', async () => {
    const image = new Blob([new Uint8Array(36 * 1024 * 1024)], { type: 'image/png' });
    const now = Date.now();
    await saveRecent({ ...recent('old', new Date(now - 3000).toISOString()), image });
    await saveRecent({ ...recent('new', new Date(now - 2000).toISOString()), image });
    await putCapture({ ...capture('pending', new Date(now - 1000).toISOString()), image });
    const retained = await listRecent();
    expect(retained.map((item) => item.id)).toEqual(['new']);
    expect(await getCapture('pending')).toBeDefined();
  });

  it('rejects unsupported data versions and strips unknown fields before saving', async () => {
    await expect(
      putCapture({ ...capture('wrong'), version: 2 } as unknown as CaptureRecord),
    ).rejects.toThrow(/version/i);
    await saveRecent({
      ...recent('flattened'),
      objects: [{ secret: 'editable data' }],
    } as RecentRecord);
    expect(await listRecent()).not.toEqual([]);
    expect((await listRecent())[0]).not.toHaveProperty('objects');
  });
});
