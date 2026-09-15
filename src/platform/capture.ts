import { putCapture, takeCapture } from './storage';
import type { AreaCaptureRequest, CaptureRecord, CaptureRequest } from './types';

type Rect = AreaCaptureRequest['rect'];
type Viewport = AreaCaptureRequest['viewport'];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function isSupportedCaptureUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      url.hostname !== 'chromewebstore.google.com' &&
      !(url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
    );
  } catch {
    return false;
  }
}

export function isCaptureRequest(value: unknown): value is CaptureRequest {
  return (
    object(value) &&
    value.type === 'capture' &&
    (value.mode === 'visible' || value.mode === 'area') &&
    (value.tabId === undefined ||
      (typeof value.tabId === 'number' && Number.isInteger(value.tabId) && value.tabId >= 0))
  );
}

export function isAreaCaptureRequest(value: unknown): value is AreaCaptureRequest {
  if (
    !object(value) ||
    value.type !== 'capture-area-confirm' ||
    !object(value.rect) ||
    !object(value.viewport)
  )
    return false;
  const { rect, viewport } = value;
  for (const number of [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    viewport.width,
    viewport.height,
    viewport.devicePixelRatio,
  ]) {
    if (typeof number !== 'number' || !Number.isFinite(number)) return false;
  }
  const bounds = rect as Rect;
  const view = viewport as Viewport;
  return (
    view.width > 0 &&
    view.height > 0 &&
    view.devicePixelRatio > 0 &&
    view.devicePixelRatio <= 16 &&
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x + bounds.width <= view.width + 0.001 &&
    bounds.y + bounds.height <= view.height + 0.001
  );
}

/** captureVisibleTab's real pixel dimensions are authoritative, including browser zoom. */
export function cropToPixels(
  rect: Rect,
  viewport: Viewport,
  bitmap: { width: number; height: number },
): Rect {
  if (
    !isAreaCaptureRequest({ type: 'capture-area-confirm', rect, viewport }) ||
    !Number.isInteger(bitmap.width) ||
    !Number.isInteger(bitmap.height) ||
    bitmap.width <= 0 ||
    bitmap.height <= 0 ||
    bitmap.width > 32768 ||
    bitmap.height > 32768 ||
    bitmap.width * bitmap.height > 80_000_000
  ) {
    throw new Error('The capture dimensions are invalid or too large. Select a smaller area.');
  }
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  const x = Math.max(0, Math.floor(rect.x * scaleX));
  const y = Math.max(0, Math.floor(rect.y * scaleY));
  const right = Math.min(bitmap.width, Math.ceil((rect.x + rect.width) * scaleX));
  const bottom = Math.min(bitmap.height, Math.ceil((rect.y + rect.height) * scaleY));
  return { x, y, width: right - x, height: bottom - y };
}

interface PageState extends Viewport {
  url: string;
  scrollX: number;
  scrollY: number;
  documentId: string;
}

interface PendingArea {
  tabId: number;
  url: string;
  documentId: string;
  createdAt: number;
}

const AREA_SESSION_PREFIX = 'captureArea:';
const AREA_TTL_MS = 10 * 60 * 1000;
const CAPTURE_INTERVAL_MS = 550;
let captureQueue: Promise<void> = Promise.resolve();

export function isExtensionPageSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
}

export function captureFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot access|missing host permission|activeTab|extensions gallery/i.test(message)) {
    return 'Chrome cannot capture this page. Open a regular website, then click the ContextSnap icon and try again.';
  }
  if (/no tab|invalid tab|frame.*removed|no frame/i.test(message)) {
    return 'The page closed or changed. Return to the page and start a new capture.';
  }
  if (/MAX_CAPTURE_VISIBLE_TAB|quota.*capture/i.test(message)) {
    return 'Chrome is processing another screenshot. Wait a moment and try again.';
  }
  return message || 'The screenshot could not be captured. Please try again.';
}

async function targetTab(tabId?: number): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  const tab =
    tabId === undefined
      ? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      : await chrome.tabs.get(tabId);
  if (!tab || tab.id === undefined)
    throw new Error('No active page was found. Open a website and try again.');
  if (!isSupportedCaptureUrl(tab.url)) {
    throw new Error(
      'Open a regular http or https website to capture it. Chrome settings, extension pages, the Web Store, and local files cannot be captured here.',
    );
  }
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tab.id)
    throw new Error('The active tab changed. Return to your page and try again.');
  return tab as chrome.tabs.Tab & { id: number; url: string };
}

async function readPage(tabId: number, clearSelection = false): Promise<PageState> {
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    args: [clearSelection],
    func: async (clear: boolean) => {
      const selectionWindow = window as Window & { __contextSnapAreaCleanup?: () => void };
      if (clear && selectionWindow.__contextSnapAreaCleanup) {
        selectionWindow.__contextSnapAreaCleanup();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        url: location.href,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    },
  });
  if (!frame?.result || !frame.documentId)
    throw new Error('The page changed. Start a new capture.');
  return { ...frame.result, documentId: frame.documentId };
}

function pagesMatch(a: PageState, b: PageState): boolean {
  return (
    a.documentId === b.documentId &&
    a.url === b.url &&
    a.width === b.width &&
    a.height === b.height &&
    a.devicePixelRatio === b.devicePixelRatio &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY
  );
}

async function waitForCaptureSlot(): Promise<void> {
  const stored = await chrome.storage.session.get('lastCaptureAt');
  const previous = typeof stored.lastCaptureAt === 'number' ? stored.lastCaptureAt : 0;
  const delay = Math.min(
    CAPTURE_INTERVAL_MS,
    Math.max(0, previous + CAPTURE_INTERVAL_MS - Date.now()),
  );
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

function serializedCapture<T>(work: () => Promise<T>): Promise<T> {
  const result = captureQueue.then(work);
  captureQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function captureImage(
  tabId: number,
  area?: AreaCaptureRequest,
  pending?: PendingArea,
): Promise<void> {
  return serializedCapture(async () => {
    await waitForCaptureSlot();
    const tab = await targetTab(tabId);
    const before = await readPage(tab.id, true);
    if (
      before.url !== tab.url ||
      (pending && (pending.documentId !== before.documentId || pending.url !== before.url))
    ) {
      throw new Error('The page changed during selection. Start a new capture.');
    }
    if (
      area &&
      (area.viewport.width !== before.width ||
        area.viewport.height !== before.height ||
        area.viewport.devicePixelRatio !== before.devicePixelRatio)
    ) {
      throw new Error('The page size or zoom changed. Select your area again.');
    }
    await targetTab(tab.id);
    await chrome.storage.session.set({ lastCaptureAt: Date.now() });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const afterTab = await targetTab(tab.id);
    const after = await readPage(tab.id);
    if (afterTab.url !== tab.url || !pagesMatch(before, after)) {
      throw new Error('The page moved or changed while capturing. Please try again.');
    }
    const source = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(source);
    let record: CaptureRecord;
    try {
      // The full viewport also goes through dimension validation before creating a canvas.
      const rect = cropToPixels(
        area?.rect ?? { x: 0, y: 0, width: before.width, height: before.height },
        before,
        bitmap,
      );
      let image = source;
      if (area) {
        const canvas = new OffscreenCanvas(rect.width, rect.height);
        const context = canvas.getContext('2d');
        if (!context)
          throw new Error('Chrome could not prepare the screenshot. Try a smaller area.');
        context.drawImage(
          bitmap,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height,
        );
        image = await canvas.convertToBlob({ type: 'image/png' });
      }
      record = {
        version: 1,
        id: crypto.randomUUID(),
        image,
        width: rect.width,
        height: rect.height,
        title: (tab.title || new URL(tab.url).hostname).slice(0, 2048),
        url: tab.url.slice(0, 16384),
        createdAt: new Date().toISOString(),
        mode: area ? 'area' : 'visible',
      };
    } finally {
      bitmap.close();
    }
    await putCapture(record);
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`editor.html?capture=${encodeURIComponent(record.id)}`),
        windowId: tab.windowId,
        openerTabId: tab.id,
      });
    } catch (error) {
      await takeCapture(record.id);
      throw error;
    }
  });
}

async function cleanAreaSessions(): Promise<void> {
  const sessions = await chrome.storage.session.get(null);
  const expired = Object.entries(sessions)
    .filter(
      ([key, value]) =>
        key.startsWith(AREA_SESSION_PREFIX) &&
        (!object(value) ||
          typeof value.createdAt !== 'number' ||
          Date.now() - value.createdAt > AREA_TTL_MS),
    )
    .map(([key]) => key);
  if (expired.length) await chrome.storage.session.remove(expired);
}

export async function startCapture(mode: CaptureRequest['mode'], tabId?: number): Promise<void> {
  const tab = await targetTab(tabId);
  if (mode === 'visible') {
    await forgetAreaSession(tab.id);
    return captureImage(tab.id);
  }
  await cleanAreaSessions();
  const page = await readPage(tab.id);
  const key = `${AREA_SESSION_PREFIX}${tab.id}`;
  await chrome.storage.session.set({
    [key]: {
      tabId: tab.id,
      documentId: page.documentId,
      url: page.url,
      createdAt: Date.now(),
    } satisfies PendingArea,
  });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, documentIds: [page.documentId] },
      files: ['area.js'],
    });
  } catch (error) {
    await chrome.storage.session.remove(key);
    throw error;
  }
}

async function areaSession(sender: chrome.runtime.MessageSender): Promise<PendingArea> {
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.documentId
  ) {
    throw new Error('This capture request did not come from an active selection.');
  }
  const key = `${AREA_SESSION_PREFIX}${sender.tab.id}`;
  const value: unknown = (await chrome.storage.session.get(key))[key];
  if (
    !object(value) ||
    value.tabId !== sender.tab.id ||
    value.documentId !== sender.documentId ||
    value.url !== sender.url ||
    typeof value.createdAt !== 'number' ||
    Date.now() - value.createdAt > AREA_TTL_MS
  ) {
    throw new Error('The area selection expired or the page changed. Start a new capture.');
  }
  return value as unknown as PendingArea;
}

export async function confirmAreaCapture(
  request: AreaCaptureRequest,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (!isAreaCaptureRequest(request))
    throw new Error('The selected area is invalid. Select an area inside the page.');
  const pending = await areaSession(sender);
  await chrome.storage.session.remove(`${AREA_SESSION_PREFIX}${pending.tabId}`);
  await captureImage(pending.tabId, request, pending);
}

export async function cancelAreaCapture(sender: chrome.runtime.MessageSender): Promise<void> {
  const pending = await areaSession(sender);
  await forgetAreaSession(pending.tabId);
}

export async function forgetAreaSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${AREA_SESSION_PREFIX}${tabId}`);
}
