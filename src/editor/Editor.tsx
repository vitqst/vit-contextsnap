import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ImagePlus, LockKeyhole, Redo2, Undo2, X } from 'lucide-react';
import {
  DEFAULT_STYLE,
  newObjectBase,
  nextStepNumber,
  type DrawingObject,
  type EditorDocument,
  type ObjectStyle,
  type Point,
  type Tool,
  type TextObject,
  type BrushSettings,
} from '../core/model';
import { moveObject } from '../core/geometry';
import { documentBounds } from '../core/document-bounds';
import { placeImage } from '../core/image-geometry';
import { canReorderObject, reorderObject } from '../core/layers';
import { deleteSelection } from '../core/selection';
import { getArrowLabelLayout } from '../core/arrow-label';
import { LABEL_FONT_FAMILY } from '../core/label-layout';
import { getTextLayout } from '../core/text-layout';
import { DEFAULT_BRUSH, normalizeBrush } from '../core/brush';
import { getNoteLayout, objectText, stickyTextColor, withObjectText } from '../core/notes';
import { checkImageSize, exportFilename, flattenImage, loadImage } from '../export/image';
import { exportPng, parseDrawingStyle, type EditorPlatform } from '../platform/editor-platform';
import { listRecent, takeCapture } from '../platform/storage';
import type { CaptureRecord } from '../platform/types';
import { sourceWebsiteUrl } from '../platform/source-navigation';
import { IconButton } from '../ui/IconButton';
import { DrawingCanvas } from './DrawingCanvas';
import { EditorFooter } from './EditorFooter';
import { EditorHeader } from './EditorHeader';
import { EmptyState } from './EmptyState';
import { Properties } from './Properties';
import { MultiSelectionProperties } from './MultiSelectionProperties';
import { Toolbar } from './Toolbar';
import { ZoomControls } from './ZoomControls';
import { useDocument } from './useDocument';
import { ImageAssetStore } from './image-assets';
import { fitViewport, panViewport, zoomViewport, type Viewport } from './viewport';

const HINTS: Record<Tool, string> = {
  select: 'Click to select · Shift-click to select multiple · Drag to move · Double-click to label',
  arrow: 'Drag a straight arrow · Select it and drag its middle handle to bend it',
  pen: 'Draw freely · Pen pressure supported',
  rectangle: 'Drag to frame a detail · Hold Shift for a square',
  text: 'Click to add wrapping text · Drag a side handle to change its width',
  sticky: 'Click or drag to place a note · Double-click to edit · Drag a corner to resize',
  redact: 'Drag over private details to cover them permanently on export',
  step: 'Click to add numbered steps · V to select and move them',
  magnifier: 'Click for a lens · Drag to choose its size · Select and drag a handle to resize',
  blur: 'Drag to soften a region · Use Redact for sensitive information',
  crop: 'Drag to crop · Drag handles to resize · Drag inside to move · Esc to finish',
};

interface EditingText {
  object: DrawingObject;
  value: string;
}

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

function acceptsTextSelection(target: EventTarget | null): boolean {
  if (!isTextTarget(target)) return false;
  if (!(target instanceof HTMLInputElement)) return true;
  return ![
    'range',
    'checkbox',
    'radio',
    'color',
    'file',
    'button',
    'submit',
    'reset',
    'image',
  ].includes(target.type);
}

export function Editor({ platform }: { platform: EditorPlatform }) {
  const validateDocument = useRef<(doc: EditorDocument) => boolean>(() => true);
  const state = useDocument((doc) => validateDocument.current(doc));
  const [capture, setCapture] = useState<CaptureRecord | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [style, setStyle] = useState<ObjectStyle>(DEFAULT_STYLE);
  const [stickyStyle, setStickyStyle] = useState<ObjectStyle>({
    ...DEFAULT_STYLE,
    color: '#ffe58f',
    shadow: true,
  });
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panGesture = useRef<{ id: number; start: Point; view: Viewport } | null>(null);
  const [editing, setEditing] = useState<EditingText | null>(null);
  const liveEditing = useRef<EditingText | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [allowCaptureOpener, setAllowCaptureOpener] = useState(false);
  const [cancelToken, setCancelToken] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [exportedDocument, setExportedDocument] = useState<EditorDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const layerInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const importGeneration = useRef(0);
  const assetStore = useRef(new ImageAssetStore());
  const insertionPending = useRef(false);
  const clipboardPending = useRef(false);
  const replacementPending = useRef(false);
  const navigationPending = useRef(false);
  const selected = state.doc.objects.find((object) => object.id === state.selectedId);
  const contentBounds = image
    ? documentBounds(image.naturalWidth, image.naturalHeight, state.doc.objects)
    : { x: 0, y: 0, width: 1, height: 1 };
  // Fit leaves room for floating tools, but the camera itself covers the whole workspace.
  const fitted = fitViewport(contentBounds, {
    width: Math.max(1, viewportSize.width - 214),
    height: Math.max(1, viewportSize.height - 162),
  });
  const camera = viewport ?? { ...fitted, x: fitted.x + 214, y: fitted.y + 94 };
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const scale = camera.scale;
  function setZoom(next: number | null) {
    if (next === null) setViewport(null);
    else
      setViewport(
        zoomViewport(
          cameraRef.current,
          { x: viewportSize.width / 2, y: viewportSize.height / 2 },
          next,
        ),
      );
  }
  const hasTextDraft = !!editing && editing.value !== objectText(editing.object);
  const hasUnsavedWork = !!image && (state.committed !== exportedDocument || hasTextDraft);
  const unsavedWork = useRef(hasUnsavedWork);
  unsavedWork.current = hasUnsavedWork;
  const shouldConfirmClose = useRef(false);
  shouldConfirmClose.current = hasUnsavedWork || replacing || inserting;
  // Export renders an independent snapshot; editing can continue while it is saved.
  const editingLocked = loading || inserting || replacing;
  const locked = busy || editingLocked;
  validateDocument.current = (doc) => {
    if (!image) return true;
    const bounds = documentBounds(image.naturalWidth, image.naturalHeight, doc.objects);
    try {
      checkImageSize(bounds.width, bounds.height);
      return true;
    } catch {
      setError(
        'The expanded canvas would exceed 32 megapixels or 16,384 pixels per side. Move the object closer or use a smaller image.',
      );
      return false;
    }
  };

  const openCapture = useCallback(
    async (record: CaptureRecord, freshCapture = false) => {
      const generation = ++importGeneration.current;
      setLoading(true);
      setError('');
      try {
        const decoded = await loadImage(record.image);
        if (generation !== importGeneration.current) return;
        assetStore.current.dispose();
        assetStore.current = new ImageAssetStore();
        state.reset();
        setExportedDocument(null);
        setCapture(record);
        setAllowCaptureOpener(freshCapture && record.mode !== 'import');
        setImage(decoded);
        setTool('arrow');
        setViewport(null);
        liveEditing.current = null;
        setEditing(null);
        setCancelToken((n) => n + 1);
      } catch (cause) {
        if (generation === importGeneration.current)
          setError(cause instanceof Error ? cause.message : 'Could not open this image.');
      } finally {
        if (generation === importGeneration.current) setLoading(false);
      }
    },
    [state.reset],
  );

  useEffect(
    () => () => {
      importGeneration.current++;
      assetStore.current.dispose();
    },
    [],
  );

  const importFile = useCallback(
    async (file: File) => {
      if (busy || loading || insertionPending.current || replacementPending.current) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setError('Choose a PNG, JPEG, or WebP image.');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('This file is too large. Choose an image smaller than 50 MB.');
        return;
      }
      replacementPending.current = true;
      setReplacing(true);
      setError('');
      try {
        if (unsavedWork.current && !(await platform.confirmReplace())) return;
        await openCapture({
          version: 1,
          id: crypto.randomUUID(),
          image: file,
          width: 0,
          height: 0,
          title: file.name,
          url: '',
          createdAt: new Date().toISOString(),
          mode: 'import',
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open this image.');
      } finally {
        replacementPending.current = false;
        setReplacing(false);
      }
    },
    [openCapture, platform, busy, loading],
  );

  async function captureScreenshot() {
    if (
      !platform.captureScreenshot ||
      busy ||
      loading ||
      insertionPending.current ||
      replacementPending.current
    )
      return;
    replacementPending.current = true;
    setReplacing(true);
    setCapturing(true);
    setError('');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setCancelToken((n) => n + 1);
    state.preview(null);
    try {
      // Explicit screenshot requests are a fast replacement workflow. Keep the
      // existing document until capture and decoding succeed, but do not prompt.
      const record = await platform.captureScreenshot();
      if (record) await openCapture(record);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not capture the screen.');
    } finally {
      replacementPending.current = false;
      setReplacing(false);
      setCapturing(false);
    }
  }

  // Native menu listeners outlive renders, so always dispatch against the latest editor state.
  const captureFromTray = useRef(captureScreenshot);
  captureFromTray.current = captureScreenshot;
  useEffect(() => {
    if (!platform.watchCapture) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void platform
      .watchCapture(() => {
        if (!disposed) void captureFromTray.current();
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((cause: unknown) => {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : 'Could not enable tray capture.');
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [platform]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('capture');
    const recentId = params.get('recent');
    if (!id && !recentId) return;
    setLoading(true);
    void (async () => {
      try {
        const record = id
          ? await takeCapture(id)
          : (await listRecent()).find((item) => item.id === recentId);
        if (!record)
          throw new Error(
            'This capture has already been opened or has expired. Capture the page again, or open a recent export from the popup.',
          );
        await openCapture(record, !!id);
        window.history.replaceState(null, '', location.pathname);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load this capture.');
      } finally {
        setLoading(false);
      }
    })();
  }, [openCapture]);

  useEffect(() => {
    let active = true;
    void platform
      .loadDrawingStyle()
      .then((saved) => {
        const parsed = parseDrawingStyle(saved);
        if (active && parsed) setStyle(parsed);
      })
      .catch(() => {
        /* Defaults still work when settings are unavailable. */
      });
    return () => {
      active = false;
    };
  }, [platform]);

  useLayoutEffect(() => {
    if (!image || !stage.current) return;
    const element = stage.current;
    const measure = () => {
      setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (isTextTarget(event.target) || panGesture.current) return;
      event.preventDefault();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const dx = event.deltaX * factor;
      const dy = event.deltaY * factor;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        setViewport(
          zoomViewport(
            cameraRef.current,
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            cameraRef.current.scale * Math.exp(-dy * 0.002),
          ),
        );
      } else {
        setViewport(
          panViewport(cameraRef.current, {
            x: -(event.shiftKey ? dy : dx),
            y: event.shiftKey ? 0 : -dy,
          }),
        );
      }
    };
    // React delegates wheel events passively; native non-passive handling prevents browser zoom.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [image]);

  useEffect(() => {
    const release = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => {
      setSpaceHeld(false);
      panGesture.current = null;
    };
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    if (editing) {
      textInput.current?.focus({ preventScroll: true });
      textInput.current?.select();
    }
  }, [editing?.object.id]);

  useEffect(() => {
    if (platform.watchClose) {
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void platform
        .watchClose(
          () => shouldConfirmClose.current,
          (cause) => {
            if (!disposed)
              setError(cause instanceof Error ? cause.message : 'Could not quit the app.');
          },
        )
        .then((cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        })
        .catch((cause: unknown) => {
          if (!disposed)
            setError(
              cause instanceof Error ? cause.message : 'Could not enable the unsaved-work warning.',
            );
        });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }
    const handler = (event: BeforeUnloadEvent) => {
      if (shouldConfirmClose.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [platform]);

  function updateObject(object: DrawingObject) {
    // A property pointer event can immediately follow the inline editor's blur.
    // Read its synchronous commit rather than the previous React render.
    const current = state.getCurrent();
    state.commit({
      ...current,
      objects: current.objects.map((item) => (item.id === object.id ? object : item)),
    });
  }

  function changeFontSize(fontSize: number | null, preview = false) {
    if (fontSize === null) {
      if (preview) state.preview(null);
      return;
    }
    const current = state.getCurrent();
    const object = current.objects.find((item) => item.id === selected?.id);
    if (!object) return;
    // A native IME may commit its final character when the slider takes focus.
    // Change only typography on the latest object, never its captured text draft.
    const next: DrawingObject =
      object.type === 'sticky'
        ? { ...object, fontSize, fontSizing: 'manual' }
        : object.type === 'text'
          ? { ...object, fontSize }
          : { ...object, labelFontSize: fontSize };
    const document = {
      ...current,
      objects: current.objects.map((item) => (item.id === next.id ? next : item)),
    };
    if (preview) state.preview(document);
    else state.commit(document);
  }

  function changeTextBackground(change: Partial<NonNullable<TextObject['background']>>) {
    // Clicking the control can commit a native IME draft on blur. Merge only
    // background fields into the current object so that final text is retained.
    const object = state.getCurrent().objects.find((item) => item.id === selected?.id);
    if (object?.type !== 'text') return;
    updateObject({
      ...object,
      background: { enabled: false, color: '#ffffff', ...object.background, ...change },
    });
  }

  function changeStyle(change: Partial<ObjectStyle>) {
    if (selected?.type === 'sticky' || (!selected && tool === 'sticky')) {
      setStickyStyle((current) => ({ ...current, ...change }));
      if (selected) updateObject({ ...selected, style: { ...selected.style, ...change } });
      return;
    }
    const next = { ...style, ...change };
    setStyle(next);
    if (selected) updateObject({ ...selected, style: { ...selected.style, ...change } });
    void platform.saveDrawingStyle(next).catch(() => {
      /* Per-session settings remain available. */
    });
  }

  function deleteSelected() {
    if (!state.selectedIds.length) return;
    setCancelToken((n) => n + 1);
    state.commit(deleteSelection(state.getCurrent(), state.selectedIds));
    state.select(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const current = state.getCurrent();
    let duplicate = { ...moveObject(selected, { x: 20, y: 20 }), id: crypto.randomUUID() };
    if (duplicate.type === 'step')
      duplicate = { ...duplicate, number: nextStepNumber(current.objects) };
    state.commit({ ...current, objects: [...current.objects, duplicate] });
    state.select(duplicate.id);
  }

  function reorderSelected(direction: 'forward' | 'backward') {
    if (!state.selectedId) return;
    const current = state.getCurrent();
    const objects = reorderObject(current.objects, state.selectedId, direction);
    if (objects !== current.objects) state.commit({ ...current, objects });
  }

  async function backToWebsite() {
    if (!capture || !platform.returnToWebsite || navigationPending.current) return;
    navigationPending.current = true;
    setReturning(true);
    setError('');
    try {
      await platform.returnToWebsite({ url: capture.url, allowCaptureOpener });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not return to the website.');
    } finally {
      navigationPending.current = false;
      setReturning(false);
    }
  }

  async function addImage(file: File, center?: Point) {
    if (loading || busy || insertionPending.current || replacementPending.current) return;
    if (!image) {
      await importFile(file);
      return;
    }
    const store = assetStore.current;
    insertionPending.current = true;
    setInserting(true);
    setError('');
    // End a draft/gesture before the async decode; commit against the latest document below.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setCancelToken((n) => n + 1);
    state.preview(null);
    try {
      const asset = await store.add(file);
      if (store !== assetStore.current) return;
      const current = state.getCurrent();
      const bounds = current.crop ?? {
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      const object: DrawingObject = {
        ...newObjectBase(style),
        type: 'image',
        assetId: asset.id,
        rect: placeImage(asset, bounds, center),
      };
      setCancelToken((n) => n + 1);
      state.commit({ ...current, objects: [...current.objects, object] });
      state.select(object.id);
      setTool('select');
      setMessage('Image added. Drag to move; use a corner to resize.');
    } catch (cause) {
      if (store === assetStore.current)
        setError(cause instanceof Error ? cause.message : 'Could not add this image.');
    } finally {
      insertionPending.current = false;
      setInserting(false);
    }
  }

  function startText(object: DrawingObject) {
    const draft = { object, value: objectText(object) };
    if (!previewText(draft)) return;
    liveEditing.current = draft;
    setEditing(draft);
    state.select(object.id);
  }

  function previewText(draft: EditingText) {
    const current = state.getCurrent();
    const next = withObjectText(draft.object, draft.value);
    const exists = current.objects.some((item) => item.id === next.id);
    const document = {
      ...current,
      objects: exists
        ? current.objects.map((item) => (item.id === next.id ? next : item))
        : [...current.objects, next],
    };
    // Keep the input and painted draft in agreement when a huge paste exceeds
    // the export safety budget. The last valid edit remains available to save.
    if (!validateDocument.current(document)) return false;
    state.preview(document);
    return true;
  }

  function changeText(value: string) {
    const current = liveEditing.current;
    if (!current) return;
    const draft = { ...current, value };
    if (!previewText(draft)) return;
    liveEditing.current = draft;
    setEditing(draft);
  }

  function cancelText() {
    const draft = liveEditing.current;
    liveEditing.current = null;
    setEditing(null);
    state.preview(null);
    if (draft && !state.getCurrent().objects.some((item) => item.id === draft.object.id))
      state.select(null);
  }

  function finishText() {
    const draft = liveEditing.current;
    if (!draft) return;
    // Clear synchronously: removing the textarea may dispatch a second blur.
    liveEditing.current = null;
    const value = draft.value;
    const object = draft.object;
    const next = withObjectText(object, value);
    const current = state.getCurrent();
    const existing = current.objects.some((item) => item.id === next.id);
    if (existing) {
      if (value !== objectText(object))
        state.commit({
          ...current,
          objects: current.objects.map((item) => (item.id === next.id ? next : item)),
        });
      else state.preview(null);
    } else if (value.trim()) state.commit({ ...current, objects: [...current.objects, next] });
    else state.preview(null);
    setEditing(null);
    state.select(value.trim() || existing ? next.id : null);
  }

  async function rememberExport(blob: Blob, snapshot: EditorDocument) {
    if (!capture || !image || !platform.saveRecent) return;
    const crop =
      snapshot.crop ?? documentBounds(image.naturalWidth, image.naturalHeight, snapshot.objects);
    await platform.saveRecent({
      ...capture,
      id: crypto.randomUUID(),
      image: blob,
      width: crop.width,
      height: crop.height,
      exportedAt: new Date().toISOString(),
    });
  }

  async function exportImage(action: 'copy' | 'save') {
    if (
      !image ||
      !capture ||
      busy ||
      loading ||
      insertionPending.current ||
      replacementPending.current
    )
      return;
    setBusy(true);
    setError('');
    const snapshot = state.getCurrent();
    const pending = flattenImage(image, snapshot, assetStore.current.assets);
    try {
      const blob = await exportPng(platform, action, pending, exportFilename(capture));
      if (!blob) return;
      setMessage(action === 'copy' ? 'Image copied. Ready to paste.' : platform.saveSuccessMessage);
      setExportedDocument(snapshot);
      try {
        await rememberExport(blob, snapshot);
      } catch {
        setError('Your image was exported, but Recent storage is full or unavailable.');
      }
    } catch (cause) {
      setError(
        action === 'copy'
          ? `Could not copy the image. Try again, or use ${platform.saveLabel}.`
          : cause instanceof Error
            ? cause.message
            : 'Could not export the image.',
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const textSelection = acceptsTextSelection(event.target);
      if (modifier && !event.altKey && key === 'a' && !textSelection) {
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        if (editingLocked || replacementPending.current) return;
        // Return keyboard focus to the canvas so Delete acts on this selection,
        // even when selecting one object leaves its properties panel mounted.
        if (event.target instanceof HTMLInputElement) event.target.blur();
        setCancelToken((n) => n + 1);
        state.preview(null);
        state.selectAll();
        setTool('select');
        return;
      }
      if (event.key === 'Escape' && !textSelection) {
        event.preventDefault();
        // Clear a browser selection left over from the old Ctrl+A behavior too.
        window.getSelection()?.removeAllRanges();
        if (editingLocked || replacementPending.current) return;
        setCancelToken((n) => n + 1);
        state.select(null);
        setTool('select');
        cancelText();
        return;
      }
      if (editingLocked || replacementPending.current) return;
      if (isTextTarget(event.target)) return;
      if (event.code === 'Space' && !modifier) {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (modifier && key === 'v' && platform.readClipboardImage) {
        event.preventDefault();
        void pasteNativeImage();
        return;
      }
      if (modifier && ['=', '+', '-'].includes(key)) {
        event.preventDefault();
        setZoom(scale * (key === '-' ? 1 / 1.2 : 1.2));
        return;
      }
      if (modifier && event.shiftKey && key === 's' && platform.captureScreenshot) {
        event.preventDefault();
        void captureScreenshot();
        return;
      }
      if (modifier && key === 'z') {
        event.preventDefault();
        setCancelToken((n) => n + 1);
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (modifier && key === 'y') {
        event.preventDefault();
        setCancelToken((n) => n + 1);
        state.redo();
        return;
      }
      if (modifier && key === 'c' && image) {
        event.preventDefault();
        void exportImage('copy');
        return;
      }
      if (modifier && key === '0') {
        event.preventDefault();
        setZoom(null);
        return;
      }
      if (modifier && key === 'd') {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!modifier && !event.altKey) {
        const shortcuts: Record<string, Tool> = {
          v: 'select',
          a: 'arrow',
          p: 'pen',
          r: 'rectangle',
          t: 'text',
          n: 'sticky',
          x: 'redact',
          c: 'crop',
          s: 'step',
          m: 'magnifier',
          b: 'blur',
        };
        const next = shortcuts[key];
        if (next) {
          event.preventDefault();
          setTool(next);
          if (next !== 'select') state.select(null);
        }
        if (selected && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          updateObject(
            moveObject(selected, {
              x: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
              y: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0,
            }),
          );
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (isTextTarget(event.target)) return;
      if (clipboardPending.current) {
        event.preventDefault();
        return;
      }
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/'),
      );
      if (file) {
        event.preventDefault();
        void addImage(file);
      } else if (platform.readClipboardImage) {
        event.preventDefault();
        void pasteNativeImage();
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  async function pasteNativeImage() {
    if (
      !platform.readClipboardImage ||
      clipboardPending.current ||
      locked ||
      insertionPending.current ||
      replacementPending.current
    )
      return;
    clipboardPending.current = true;
    insertionPending.current = true;
    setInserting(true);
    setCancelToken((n) => n + 1);
    state.preview(null);
    const generation = importGeneration.current;
    setError('');
    try {
      const png = await platform.readClipboardImage();
      if (!png || generation !== importGeneration.current || replacementPending.current) return;
      insertionPending.current = false;
      await addImage(new File([png], 'clipboard.png', { type: 'image/png' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not paste the clipboard image.');
    } finally {
      clipboardPending.current = false;
      insertionPending.current = false;
      setInserting(false);
    }
  }

  const editingObject = editing ? withObjectText(editing.object, editing.value) : null;
  const editingTextLayout = editingObject?.type === 'text' ? getTextLayout(editingObject) : null;
  const editingNoteLayout =
    editingObject?.type === 'arrow'
      ? getArrowLabelLayout(editingObject, state.doc.crop ?? undefined)
      : editingObject && editingObject.type !== 'text'
        ? getNoteLayout(editingObject, state.doc.crop ?? undefined)
        : null;
  const editingLayout = editingTextLayout ?? editingNoteLayout;
  const editingHeight = editingLayout
    ? Math.max(1, editingLayout.lines.length) * editingLayout.lineHeight
    : 0;
  const editingWidth = editingLayout?.contentWidth ?? editingLayout?.rect.width ?? 0;
  const editingColor =
    editingObject?.type === 'sticky'
      ? stickyTextColor(editingObject.style.color)
      : editingObject?.style.color;
  const objectCount = state.doc.objects.length;

  return (
    <div
      className="editor-app"
      onDragOver={(event) => {
        event.preventDefault();
        if (locked) return;
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file) {
          const bounds = stage.current?.getBoundingClientRect();
          const center =
            image &&
            bounds &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
              ? {
                  x: (event.clientX - bounds.left - camera.x) / scale,
                  y: (event.clientY - bounds.top - camera.y) / scale,
                }
              : undefined;
          void addImage(file, center);
        }
      }}
    >
      <input
        className="sr-only"
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Open image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = '';
        }}
      />
      <input
        className="sr-only"
        ref={layerInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Add image file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addImage(file);
          event.target.value = '';
        }}
      />
      <EditorHeader
        captureTitle={capture?.title ?? null}
        hasImage={!!image}
        busy={locked}
        canReturn={
          !!platform.returnToWebsite &&
          !!image &&
          capture?.mode !== 'import' &&
          !!sourceWebsiteUrl(capture?.url)
        }
        returning={returning}
        onReturn={() => void backToWebsite()}
        onAddImage={() => layerInput.current?.click()}
        onOpenImage={() => fileInput.current?.click()}
        onDownloadImage={() => void exportImage('save')}
        onCopyImage={() => void exportImage('copy')}
        saveLabel={platform.saveLabel}
        onCapture={platform.captureScreenshot ? () => void captureScreenshot() : undefined}
      />
      {error && (
        <div className="editor-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {image ? (
        <>
          <main className="editor-workspace" inert={editingLocked}>
            <div className="toolbar-position">
              <Toolbar
                tool={tool}
                onChange={(next) => {
                  setTool(next);
                  if (next !== 'select') state.select(null);
                }}
              />
            </div>
            {state.selectedIds.length > 1 ? (
              <MultiSelectionProperties
                count={state.selectedIds.length}
                onDelete={deleteSelected}
              />
            ) : (
              <Properties
                sceneBounds={state.doc.crop ?? contentBounds}
                tool={tool}
                selected={selected}
                style={selected?.style ?? (tool === 'sticky' ? stickyStyle : style)}
                onStyle={changeStyle}
                onLabel={(label) => {
                  if (selected) updateObject(withObjectText(selected, label));
                }}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
                onFontSize={(fontSize) => changeFontSize(fontSize)}
                onUpdate={updateObject}
                onPreviewFontSize={(fontSize) => changeFontSize(fontSize, true)}
                onTextBackground={changeTextBackground}
                onAutoFontSize={() => {
                  const object = state
                    .getCurrent()
                    .objects.find((item) => item.id === selected?.id);
                  if (object?.type === 'sticky') updateObject({ ...object, fontSizing: 'auto' });
                }}
                brush={selected?.type === 'pen' ? normalizeBrush(selected.brush) : brush}
                onBrush={(value) => {
                  setBrush(value);
                  if (selected?.type === 'pen') updateObject({ ...selected, brush: value });
                }}
                canBringForward={
                  !!selected && canReorderObject(state.doc.objects, selected.id, 'forward')
                }
                canSendBackward={
                  !!selected && canReorderObject(state.doc.objects, selected.id, 'backward')
                }
                onReorder={reorderSelected}
              />
            )}
            <div
              className={`stage-scroll${spaceHeld ? ' pan-ready' : ''}`}
              ref={stage}
              onPointerDownCapture={(event) => {
                if (isTextTarget(event.target)) return;
                // Freeze the camera before content grows, so a drag never recenters itself.
                setViewport(cameraRef.current);
                if (event.button !== 1 && !(spaceHeld && event.button === 0)) return;
                event.preventDefault();
                event.stopPropagation();
                panGesture.current = {
                  id: event.pointerId,
                  start: { x: event.clientX, y: event.clientY },
                  view: cameraRef.current,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const pan = panGesture.current;
                if (!pan || pan.id !== event.pointerId) return;
                event.preventDefault();
                setViewport(
                  panViewport(pan.view, {
                    x: event.clientX - pan.start.x,
                    y: event.clientY - pan.start.y,
                  }),
                );
              }}
              onPointerUp={(event) => {
                if (panGesture.current?.id !== event.pointerId) return;
                panGesture.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                panGesture.current = null;
              }}
              onLostPointerCapture={() => {
                panGesture.current = null;
              }}
            >
              <div className="stage-content">
                <div
                  className="screenshot-background"
                  style={{
                    left: camera.x,
                    top: camera.y,
                    width: image.naturalWidth * scale,
                    height: image.naturalHeight * scale,
                  }}
                />
                <DrawingCanvas
                  image={image}
                  bounds={contentBounds}
                  camera={camera}
                  viewportSize={viewportSize}
                  assets={assetStore.current.assets}
                  doc={state.doc}
                  committed={state.committed}
                  getCurrent={state.getCurrent}
                  getPreview={state.getPreview}
                  tool={tool}
                  setTool={setTool}
                  style={tool === 'sticky' ? stickyStyle : style}
                  brush={brush}
                  scale={scale}
                  selectedId={state.selectedId}
                  selectedIds={state.selectedIds}
                  select={state.select}
                  preview={state.preview}
                  commit={state.commit}
                  editText={startText}
                  cancelToken={cancelToken}
                />
                <div
                  className="image-stage"
                  style={{
                    left: camera.x + contentBounds.x * scale,
                    top: camera.y + contentBounds.y * scale,
                    width: contentBounds.width * scale,
                    height: contentBounds.height * scale,
                  }}
                >
                  <div
                    className="image-caption"
                    style={{
                      left: -contentBounds.x * scale,
                      top: -contentBounds.y * scale - 26,
                      width: image.naturalWidth * scale,
                    }}
                  >
                    <span>
                      <LockKeyhole size={11} />
                      SCREENSHOT
                    </span>
                    <span>
                      {contentBounds.width} × {contentBounds.height}
                    </span>
                  </div>
                  {editing && editingLayout && (
                    <textarea
                      className={`inline-text-editor${editingNoteLayout ? ' inline-shape-editor' : ''}`}
                      ref={textInput}
                      aria-label="Edit label"
                      spellCheck={false}
                      style={{
                        left:
                          ((editingNoteLayout
                            ? editingNoteLayout.center.x - editingWidth / 2
                            : editingLayout.rect.x) -
                            contentBounds.x) *
                          scale,
                        top:
                          ((editingNoteLayout
                            ? editingNoteLayout.center.y -
                              Math.min(editingLayout.rect.height, editingHeight) / 2
                            : editingLayout.rect.y) -
                            contentBounds.y) *
                          scale,
                        // Lay out in world pixels, then scale the native caret.
                        // Re-measuring at zoomed font sizes changes wrapping/hinting.
                        transform: `scale(${scale})`,
                        width: Math.max(1, editingWidth),
                        height: Math.max(
                          1,
                          // Leave room for the native caret's font ascent/descent.
                          Math.ceil(Math.min(editingLayout.rect.height, editingHeight)) +
                            Math.ceil(editingLayout.fontSize / 4),
                        ),
                        fontFamily: LABEL_FONT_FAMILY,
                        fontSize: editingLayout.fontSize,
                        fontWeight: 500,
                        lineHeight: `${editingLayout.lineHeight}px`,
                        caretColor: editingColor,
                      }}
                      value={editing.value}
                      onChange={(event) => changeText(event.target.value)}
                      onBlur={finishText}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                          return;
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelText();
                        }
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          finishText();
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="bottom-controls">
              <div className="history-controls">
                <IconButton label="Undo" disabled={!state.canUndo} onClick={state.undo}>
                  <Undo2 size={17} />
                </IconButton>
                <IconButton label="Redo" disabled={!state.canRedo} onClick={state.redo}>
                  <Redo2 size={17} />
                </IconButton>
              </div>
              <p className="tool-hint">{HINTS[tool]}</p>
              <ZoomControls scale={scale} onChange={setZoom} />
            </div>
          </main>
          <EditorFooter
            objectCount={objectCount}
            crop={state.doc.crop}
            onResetCrop={() => {
              if (!editingLocked) state.commit({ ...state.committed, crop: null });
            }}
          />
        </>
      ) : (
        <EmptyState
          loading={locked}
          capturing={capturing}
          onOpenImage={() => fileInput.current?.click()}
          onCapture={platform.captureScreenshot ? () => void captureScreenshot() : undefined}
        />
      )}
      {message && (
        <div className="toast" role="status">
          <span>
            <Check size={14} />
          </span>
          {message}
        </div>
      )}
      {(loading || inserting || capturing) && image && (
        <div className="loading-strip" role="status">
          {capturing ? 'Capturing screenshot…' : inserting ? 'Adding image…' : 'Opening image…'}
        </div>
      )}
      {dragOver && (
        <div className="drop-overlay">
          <ImagePlus size={38} />
          <strong>{image ? 'Drop to add an image layer' : 'Drop your screenshot here'}</strong>
        </div>
      )}
    </div>
  );
}
