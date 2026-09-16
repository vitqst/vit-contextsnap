import { test as base, expect, type Page } from '@playwright/test';

interface Invocation {
  command: string;
  args: Record<string, unknown>;
}

interface DesktopBridge {
  calls: Invocation[];
  captureResult: 'image' | 'cancel' | 'error' | 'pending';
  clipboardResult: 'image' | 'empty' | 'error' | 'pending';
  saveAccepted: boolean;
  confirmAccepted: boolean;
  releaseCapture: () => void;
  releaseClipboard: () => void;
  requestQuit: () => Promise<void>;
  requestCapture: () => Promise<void>;
}

declare global {
  interface Window {
    __desktopTest: DesktopBridge;
  }
}

/** These tests exercise the real frontend and Tauri JS API, with only native IPC replaced. */
export const test = base.extend<{ desktop: Page }>({
  desktop: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      // Chromium supplies a partial `chrome` global; remove it to model a native WebView.
      Object.defineProperty(window, 'chrome', { value: undefined, configurable: true });
      const callbacks = new Map<number, (event: unknown) => unknown>();
      const listeners = new Map<string, number[]>();
      let nextCallback = 1;
      const bridge: DesktopBridge = {
        calls: [],
        captureResult: 'image',
        clipboardResult: 'image',
        saveAccepted: true,
        confirmAccepted: true,
        releaseCapture: () => {},
        releaseClipboard: () => {},
        requestQuit: async () => {
          const event = 'contextsnap:quit-requested';
          for (const id of listeners.get(event) ?? []) {
            await callbacks.get(id)?.({ event, id, payload: null });
          }
        },
        requestCapture: async () => {
          const event = 'contextsnap:capture-requested';
          for (const id of listeners.get(event) ?? []) {
            await callbacks.get(id)?.({ event, id, payload: null });
          }
        },
      };
      window.__desktopTest = bridge;
      const screenshot = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 640;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 960, 640);
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(24, 24, 96, 48);
        ctx.fillStyle = '#f7ced6';
        ctx.fillRect(100, 420, 500, 80);
        ctx.fillStyle = '#172033';
        ctx.font = '24px sans-serif';
        ctx.fillText('sensitive@example.test', 120, 465);
        return Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (c) =>
          c.charCodeAt(0),
        ).buffer;
      };
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { windowLabel: 'main', label: 'main' },
          },
          transformCallback: (callback: (event: unknown) => unknown) => {
            const id = nextCallback++;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback: (id: number) => callbacks.delete(id),
          invoke: async (command: string, args: Record<string, unknown> = {}) => {
            bridge.calls.push({ command, args });
            switch (command) {
              case 'read_clipboard_png':
                if (bridge.clipboardResult === 'error')
                  throw 'Could not read clipboard image. Copy the image again and retry.';
                if (bridge.clipboardResult === 'empty') return new ArrayBuffer(0);
                if (bridge.clipboardResult === 'pending')
                  return new Promise<ArrayBuffer>((resolve) => {
                    bridge.releaseClipboard = () => resolve(screenshot());
                  });
                return screenshot();
              case 'capture_screenshot':
                if (bridge.captureResult === 'error')
                  throw 'Screen capture permission denied. Enable screen recording in settings.';
                if (bridge.captureResult === 'cancel') return new ArrayBuffer(0);
                if (bridge.captureResult === 'pending')
                  return new Promise<ArrayBuffer>((resolve) => {
                    bridge.releaseCapture = () => resolve(new ArrayBuffer(0));
                  });
                return screenshot();
              case 'save_png':
                return bridge.saveAccepted;
              case 'copy_png':
              case 'quit_app':
                return undefined;
              case 'plugin:dialog|message': {
                const buttons = args.buttons as { OkCancelCustom?: string[] } | undefined;
                return bridge.confirmAccepted ? (buttons?.OkCancelCustom?.[0] ?? 'Ok') : 'Cancel';
              }
              case 'plugin:event|listen': {
                const event = String(args.event);
                listeners.set(event, [...(listeners.get(event) ?? []), Number(args.handler)]);
                return args.handler;
              }
              case 'plugin:event|unlisten':
                listeners.set(
                  String(args.event),
                  (listeners.get(String(args.event)) ?? []).filter((id) => id !== args.eventId),
                );
                return undefined;
              default:
                throw new Error(`Unexpected native command in desktop bridge test: ${command}`);
            }
          },
        },
        __TAURI_EVENT_PLUGIN_INTERNALS__: {
          unregisterListener: (_event: string, id: number) => callbacks.delete(id),
        },
      });
    });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Make your point. With a picture.' }),
    ).toBeVisible();
    await use(page);
    expect(errors, 'Desktop frontend should not produce uncaught browser errors').toEqual([]);
  },
});

export { expect };

export async function calls(page: Page, command: string): Promise<Invocation[]> {
  return page.evaluate(
    (name) => window.__desktopTest.calls.filter((call) => call.command === name),
    command,
  );
}

export async function capture(page: Page): Promise<void> {
  await page.locator('header').getByRole('button', { name: 'Capture screenshot' }).click();
  await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save PNG', exact: true })).toBeEnabled();
}

export async function drag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  const bounds = await page.locator('.screenshot-background').boundingBox();
  if (!bounds) throw new Error('Drawing canvas is not visible');
  const point = ({ x, y }: { x: number; y: number }) => ({
    x: bounds.x + (x / 960) * bounds.width,
    y: bounds.y + (y / 640) * bounds.height,
  });
  const from = point(start);
  const to = point(end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export async function addArrow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Arrow (A)', exact: true }).click();
  await drag(page, { x: 160, y: 160 }, { x: 620, y: 300 });
  await expect(page.getByTestId('object-count')).toHaveText('1 object');
}

export async function savedPixels(page: Page) {
  return page.evaluate(async () => {
    const saved = window.__desktopTest.calls.filter((call) => call.command === 'save_png').at(-1);
    if (!saved) throw new Error('No image was passed to native Save PNG');
    const bytes = new Uint8Array(saved.args.png as number[]);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const arrow = ctx.getImageData(140, 130, 520, 210).data;
      let colored = 0;
      for (let i = 0; i < arrow.length; i += 4)
        if (arrow[i]! > arrow[i + 1]! * 1.2 && arrow[i]! > arrow[i + 2]! * 1.2) colored++;
      return {
        width: canvas.width,
        height: canvas.height,
        privatePixel: Array.from(ctx.getImageData(300, 465, 1, 1).data),
        untouchedPixel: Array.from(ctx.getImageData(800, 550, 1, 1).data),
        coloredArrowPixels: colored,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}
