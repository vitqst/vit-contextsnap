import type { AreaCaptureRequest, CaptureReply } from './types';

type Rect = AreaCaptureRequest['rect'];
type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type SelectionWindow = Window & { __contextSnapAreaCleanup?: () => void };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export function selectionFromPoints(
  start: Point,
  end: Point,
  viewport: Size,
  square: boolean,
): Rect {
  const a = { x: clamp(start.x, 0, viewport.width), y: clamp(start.y, 0, viewport.height) };
  const b = { x: clamp(end.x, 0, viewport.width), y: clamp(end.y, 0, viewport.height) };
  if (square) {
    const directionX = b.x < a.x ? -1 : 1;
    const directionY = b.y < a.y ? -1 : 1;
    const side = Math.min(
      Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)),
      directionX < 0 ? a.x : viewport.width - a.x,
      directionY < 0 ? a.y : viewport.height - a.y,
    );
    b.x = a.x + directionX * side;
    b.y = a.y + directionY * side;
  }
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function moveSelection(rect: Rect, dx: number, dy: number, viewport: Size): Rect {
  const width = Math.min(rect.width, viewport.width);
  const height = Math.min(rect.height, viewport.height);
  return {
    x: clamp(rect.x + dx, 0, viewport.width - width),
    y: clamp(rect.y + dy, 0, viewport.height - height),
    width,
    height,
  };
}

export function resizeSelection(
  rect: Rect,
  handle: Handle,
  point: Point,
  viewport: Size,
  square: boolean,
): Rect {
  const start = {
    x: handle.includes('w') ? rect.x + rect.width : rect.x,
    y: handle.includes('n') ? rect.y + rect.height : rect.y,
  };
  const end = {
    x: handle.includes('e') || handle.includes('w') ? point.x : rect.x + rect.width,
    y: handle.includes('n') || handle.includes('s') ? point.y : rect.y + rect.height,
  };
  return selectionFromPoints(start, end, viewport, square && handle.length === 2);
}

const styles = `
  :host { all: initial; color-scheme: light; }
  * { box-sizing: border-box; }
  .overlay { all: initial; display: block; position: fixed; inset: 0; width: 100vw; height: 100vh;
    max-width: none; max-height: none; margin: 0; padding: 0; border: 0; font: 13px/1.4 system-ui, sans-serif; color: #fff;
    background: rgb(19 24 37 / 46%); cursor: crosshair; user-select: none; touch-action: none; outline: none; }
  .overlay::backdrop { background: transparent; }
  .overlay.selected { background: transparent; }
  .selection { display: none; position: absolute; border: 2px solid #8b79ef; cursor: move;
    box-shadow: 0 0 0 99999px rgb(19 24 37 / 46%); }
  .selected .selection { display: block; }
  .handle { position: absolute; width: 10px; height: 10px; border-radius: 3px; border: 2px solid #6d57ce;
    background: #fff; transform: translate(-50%, -50%); }
  [data-handle=nw] { left: 0; top: 0; cursor: nwse-resize; }
  [data-handle=n] { left: 50%; top: 0; cursor: ns-resize; }
  [data-handle=ne] { left: 100%; top: 0; cursor: nesw-resize; }
  [data-handle=e] { left: 100%; top: 50%; cursor: ew-resize; }
  [data-handle=se] { left: 100%; top: 100%; cursor: nwse-resize; }
  [data-handle=s] { left: 50%; top: 100%; cursor: ns-resize; }
  [data-handle=sw] { left: 0; top: 100%; cursor: nesw-resize; }
  [data-handle=w] { left: 0; top: 50%; cursor: ew-resize; }
  .hint, .actions { position: fixed; z-index: 2; left: 50%; transform: translateX(-50%); background: #252432;
    border: 1px solid #535060; border-radius: 12px; box-shadow: 0 8px 28px #0003; cursor: default; }
  .hint { top: 18px; padding: 10px 16px; text-align: center; max-width: calc(100vw - 24px); }
  .hint strong { color: #cbbcff; font-weight: 650; }
  .actions { bottom: 22px; display: flex; gap: 8px; align-items: center; padding: 8px; max-width: calc(100vw - 20px); }
  .dimensions { min-width: 92px; text-align: center; color: #d7d4e2; white-space: nowrap; font-variant-numeric: tabular-nums; }
  button { appearance: none; font: 600 13px/1.4 system-ui, sans-serif; border: 0; border-radius: 7px;
    padding: 9px 13px; cursor: pointer; color: #e9e7f0; background: #413e50; white-space: nowrap; }
  button.primary { background: #cbbcff; color: #271e41; }
  button:hover { filter: brightness(1.12); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  button:disabled { opacity: .45; cursor: default; }
  @media (max-width: 420px) { .hint { font-size: 11px; width: calc(100vw - 24px); } .dimensions { min-width: 65px; font-size: 11px; } button { padding: 8px; } }
`;

export function showAreaSelection(): void {
  const selectionWindow = window as SelectionWindow;
  selectionWindow.__contextSnapAreaCleanup?.();
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const controller = new AbortController();
  const host = document.createElement('div');
  host.id = 'contextsnap-area-selector';
  host.style.cssText =
    'all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:auto!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${styles}</style>
    <dialog class="overlay" tabindex="-1" aria-label="Select screenshot area" aria-describedby="selection-help">
      <div class="selection" aria-hidden="true">${(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((handle) => `<span class="handle" data-handle="${handle}"></span>`).join('')}</div>
      <div class="hint" id="selection-help"><strong>Drag to select an area</strong> · Shift for square · Arrows to move · Enter to capture · Esc to cancel</div>
      <div class="actions"><span class="dimensions" role="status" aria-live="polite">Select area</span><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="capture" class="primary" disabled>Capture area ↵</button></div>
    </dialog>`;
  const overlay = shadow.querySelector<HTMLDialogElement>('.overlay')!;
  const selection = shadow.querySelector<HTMLDivElement>('.selection')!;
  const dimensions = shadow.querySelector<HTMLSpanElement>('.dimensions')!;
  const captureButton = shadow.querySelector<HTMLButtonElement>('[data-action=capture]')!;
  const cancelButton = shadow.querySelector<HTMLButtonElement>('[data-action=cancel]')!;
  let rect: Rect | undefined;
  let drag:
    | { type: 'draw' | 'move' | Handle; origin: Point; initial?: Rect; pointerId: number }
    | undefined;
  let disposed = false;

  const viewport = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
  const render = (): void => {
    overlay.classList.toggle('selected', !!rect);
    if (rect) {
      Object.assign(selection.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      dimensions.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    } else dimensions.textContent = 'Select area';
    captureButton.disabled = !rect || rect.width < 2 || rect.height < 2;
  };

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    host.remove();
    if (selectionWindow.__contextSnapAreaCleanup === cleanup)
      delete selectionWindow.__contextSnapAreaCleanup;
    previousFocus?.focus({ preventScroll: true });
  };

  const cancel = (): void => {
    cleanup();
    void chrome.runtime.sendMessage({ type: 'capture-area-cancel' }).catch(() => undefined);
  };

  const confirm = async (): Promise<void> => {
    if (disposed || !rect || rect.width < 2 || rect.height < 2) return;
    const request: AreaCaptureRequest = {
      type: 'capture-area-confirm',
      rect: { ...rect },
      viewport: { ...viewport(), devicePixelRatio: window.devicePixelRatio },
    };
    cleanup();
    // Let Chrome paint the page without handles, dimming, or selection controls before captureVisibleTab.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      const reply: CaptureReply = await chrome.runtime.sendMessage(request);
      if (!reply.ok) showSelectionError(reply.error ?? 'Capture failed. Please try again.');
    } catch {
      showSelectionError(
        'ContextSnap could not finish the capture. Reopen the extension and try again.',
      );
    }
  };

  overlay.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button, .hint, .actions'))
        return;
      event.preventDefault();
      event.stopPropagation();
      const origin = { x: event.clientX, y: event.clientY };
      const handle = (event.target as HTMLElement).dataset.handle as Handle | undefined;
      drag = {
        type:
          handle ?? ((event.target as HTMLElement).closest('.selection') && rect ? 'move' : 'draw'),
        origin,
        initial: rect ? { ...rect } : undefined,
        pointerId: event.pointerId,
      };
      overlay.setPointerCapture(event.pointerId);
      if (drag.type === 'draw') rect = selectionFromPoints(origin, origin, viewport(), false);
      render();
    },
    { signal: controller.signal },
  );

  overlay.addEventListener(
    'pointermove',
    (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      if (drag.type === 'draw')
        rect = selectionFromPoints(drag.origin, point, viewport(), event.shiftKey);
      else if (drag.type === 'move' && drag.initial) {
        rect = moveSelection(
          drag.initial,
          point.x - drag.origin.x,
          point.y - drag.origin.y,
          viewport(),
        );
      } else if (drag.initial && drag.type !== 'move')
        rect = resizeSelection(drag.initial, drag.type, point, viewport(), event.shiftKey);
      render();
    },
    { signal: controller.signal },
  );

  const finishDrag = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return;
    drag = undefined;
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    render();
  };
  overlay.addEventListener('pointerup', finishDrag, { signal: controller.signal });
  overlay.addEventListener('pointercancel', finishDrag, { signal: controller.signal });
  overlay.addEventListener(
    'dblclick',
    (event) => {
      if (!(event.target as HTMLElement).closest('button, .hint, .actions')) {
        event.preventDefault();
        void confirm();
      }
    },
    { signal: controller.signal },
  );
  captureButton.addEventListener(
    'click',
    () => {
      void confirm();
    },
    { signal: controller.signal },
  );
  cancelButton.addEventListener('click', cancel, { signal: controller.signal });

  const stopScroll = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('wheel', stopScroll, {
    passive: false,
    capture: true,
    signal: controller.signal,
  });
  window.addEventListener('touchmove', stopScroll, {
    passive: false,
    capture: true,
    signal: controller.signal,
  });
  window.addEventListener(
    'keydown',
    (event) => {
      event.stopImmediatePropagation();
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        (shadow.activeElement === cancelButton || shadow.activeElement === captureButton)
      ) {
        event.preventDefault();
        if (shadow.activeElement === cancelButton) cancel();
        else void confirm();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void confirm();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (shadow.activeElement === cancelButton && !captureButton.disabled) captureButton.focus();
        else cancelButton.focus();
        return;
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const view = viewport();
        if (!rect) {
          const width = Math.min(320, view.width);
          const height = Math.min(180, view.height);
          rect = { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
        }
        const step = event.shiftKey ? 10 : 1;
        rect = moveSelection(
          rect,
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
          view,
        );
        render();
      }
      if ([' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.preventDefault();
    },
    { capture: true, signal: controller.signal },
  );
  window.addEventListener(
    'resize',
    () => {
      drag = undefined;
      if (rect) rect = moveSelection(rect, 0, 0, viewport());
      render();
    },
    { signal: controller.signal },
  );
  window.addEventListener('pagehide', cleanup, { signal: controller.signal });
  selectionWindow.__contextSnapAreaCleanup = cleanup;
  document.documentElement.append(host);
  // A modal inside our closed root stays interactive above the page's existing dialogs.
  overlay.showModal();
  overlay.focus({ preventScroll: true });
}

function showSelectionError(message: string): void {
  const host = document.createElement('div');
  host.style.cssText =
    'all:initial!important;position:fixed!important;bottom:24px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.style.cssText =
    'font:13px/1.5 system-ui,sans-serif;padding:14px 20px;max-width:440px;background:#322935;color:#fff;border-radius:10px;box-shadow:0 8px 30px #0003;';
  toast.textContent = message;
  shadow.append(toast);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 6000);
}
