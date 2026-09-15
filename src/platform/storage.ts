import type { CaptureRecord, RecentRecord } from './types';

const DATABASE_NAME = 'contextsnap-captures';
const DATABASE_VERSION = 1;
const MAX_RECENT = 20;
const MAX_PENDING = 5;
const MAX_BYTES = 100 * 1024 * 1024;
const PENDING_TTL_MS = 60 * 60 * 1000;

interface StoredState {
  pending: CaptureRecord[];
  recent: RecentRecord[];
}

function recordIsValid(value: unknown): value is CaptureRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CaptureRecord>;
  return (
    record.version === 1 &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    record.id.length <= 128 &&
    record.image instanceof Blob &&
    record.image.size > 0 &&
    record.image.size <= MAX_BYTES &&
    /^image\/(png|jpeg|webp)$/.test(record.image.type) &&
    typeof record.width === 'number' &&
    Number.isInteger(record.width) &&
    record.width > 0 &&
    typeof record.height === 'number' &&
    Number.isInteger(record.height) &&
    record.height > 0 &&
    record.width <= 32768 &&
    record.height <= 32768 &&
    record.width * record.height <= 80_000_000 &&
    typeof record.title === 'string' &&
    record.title.length <= 2048 &&
    typeof record.url === 'string' &&
    record.url.length <= 16384 &&
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    ['visible', 'area', 'import'].includes(record.mode ?? '')
  );
}

function recentIsValid(value: unknown): value is RecentRecord {
  return (
    recordIsValid(value) &&
    'exportedAt' in value &&
    typeof value.exportedAt === 'string' &&
    Number.isFinite(Date.parse(value.exportedAt))
  );
}

/** Whitelist the flattened image and its metadata; never persist editor objects. */
function normalizeRecord(record: CaptureRecord): CaptureRecord {
  if (record.version !== 1) throw new Error('Unsupported capture data version.');
  if (record.image?.size > MAX_BYTES)
    throw new Error('This image exceeds the 100 MB local storage limit.');
  if (!recordIsValid(record)) throw new Error('The capture image or its metadata is invalid.');
  const { version, id, image, width, height, title, url, createdAt, mode } = record;
  return { version, id, image, width, height, title, url, createdAt, mode };
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Could not read local image storage.'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const name of ['pending', 'recent']) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local image storage.'));
    request.onblocked = () => reject(new Error('Close other ContextSnap tabs, then try again.'));
  });
}

function enforceLimits(state: StoredState): void {
  state.pending = state.pending
    .filter((item) => Date.parse(item.createdAt) > Date.now() - PENDING_TTL_MS)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_PENDING);
  state.recent = state.recent
    .sort((a, b) => Date.parse(b.exportedAt) - Date.parse(a.exportedAt))
    .slice(0, MAX_RECENT);
  let bytes = [...state.pending, ...state.recent].reduce(
    (total, item) => total + item.image.size,
    0,
  );
  while (bytes > MAX_BYTES) {
    const pending = state.pending.at(-1);
    const recent = state.recent.at(-1);
    const removePending =
      pending && (!recent || Date.parse(pending.createdAt) <= Date.parse(recent.exportedAt));
    const removed = removePending ? state.pending.pop() : state.recent.pop();
    if (!removed) break;
    bytes -= removed.image.size;
  }
}

/** A shared transaction makes retention and consuming an original atomic across extension pages. */
async function updateStorage<T>(change: (state: StoredState) => T): Promise<T> {
  const database = await openDatabase();
  const transaction = database.transaction(['pending', 'recent'], 'readwrite');
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Local image storage was interrupted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not save the image locally.'));
  });
  try {
    const pendingStore = transaction.objectStore('pending');
    const recentStore = transaction.objectStore('recent');
    const [pending, recent] = await Promise.all([
      requestValue<unknown[]>(pendingStore.getAll()),
      requestValue<unknown[]>(recentStore.getAll()),
    ]);
    const state: StoredState = {
      pending: pending.filter(recordIsValid),
      recent: recent.filter(recentIsValid),
    };
    enforceLimits(state);
    const result = change(state);
    enforceLimits(state);
    for (const [store, previous, next] of [
      [pendingStore, pending, state.pending],
      [recentStore, recent, state.recent],
    ] as const) {
      const desired = new Map(next.map((record) => [record.id, record]));
      for (const record of previous) {
        const id = record && typeof record === 'object' && 'id' in record ? record.id : undefined;
        if (typeof id === 'string' && !desired.has(id)) store.delete(id);
      }
      const existing = new Map(previous.filter(recordIsValid).map((record) => [record.id, record]));
      for (const record of next) {
        if (existing.get(record.id) !== record) store.put(record);
      }
    }
    await complete;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* A failed transaction may already have aborted. */
    }
    await complete.catch(() => undefined);
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Browser storage is full. Clear recent images and try again.');
    }
    throw error;
  } finally {
    database.close();
  }
}

export async function putCapture(record: CaptureRecord): Promise<void> {
  const normalized = normalizeRecord(record);
  await updateStorage((state) => {
    state.pending = state.pending.filter((item) => item.id !== normalized.id);
    state.pending.push(normalized);
  });
}

export async function getCapture(id: string): Promise<CaptureRecord | undefined> {
  return updateStorage((state) => state.pending.find((item) => item.id === id));
}

export async function takeCapture(id: string): Promise<CaptureRecord | undefined> {
  return updateStorage((state) => {
    const record = state.pending.find((item) => item.id === id);
    state.pending = state.pending.filter((item) => item.id !== id);
    return record;
  });
}

export async function listRecent(): Promise<RecentRecord[]> {
  return updateStorage((state) => [...state.recent]);
}

export async function saveRecent(record: RecentRecord): Promise<void> {
  const normalized = { ...normalizeRecord(record), exportedAt: record.exportedAt };
  if (!recentIsValid(normalized)) throw new Error('The recent image export date is invalid.');
  await updateStorage((state) => {
    state.recent = state.recent.filter((item) => item.id !== normalized.id);
    state.recent.push(normalized);
  });
}

export async function deleteRecent(id: string): Promise<void> {
  await updateStorage((state) => {
    state.recent = state.recent.filter((item) => item.id !== id);
  });
}

export async function clearRecent(): Promise<void> {
  await updateStorage((state) => {
    state.recent = [];
  });
}
