import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Expand,
  ImagePlus,
  LockKeyhole,
  Minus,
  Plus,
  Redo2,
  Undo2,
  X,
} from 'lucide-react';
import {
  DEFAULT_STYLE,
  newObjectBase,
  nextStepNumber,
  type DrawingObject,
  type EditorDocument,
  type ObjectStyle,
  type Point,
  type Tool,
} from '../core/model';
import { moveObject } from '../core/geometry';
import { placeImage } from '../core/image-geometry';
import { canReorderObject, reorderObject } from '../core/layers';
import { getArrowLabelLayout } from '../core/arrow-label';
import { copyImage, downloadImage, exportFilename, flattenImage, loadImage } from '../export/image';
import { listRecent, saveRecent, takeCapture } from '../platform/storage';
import type { CaptureRecord } from '../platform/types';
import { returnToWebsite, sourceWebsiteUrl } from '../platform/source-navigation';
import { IconButton } from '../ui/IconButton';
import { DrawingCanvas } from './DrawingCanvas';
import { EditorFooter } from './EditorFooter';
import { EditorHeader } from './EditorHeader';
import { EmptyState } from './EmptyState';
import { Properties } from './Properties';
import { Toolbar } from './Toolbar';
import { useDocument } from './useDocument';
import { ImageAssetStore } from './image-assets';

const HINTS: Record<Tool, string> = {
  select: 'Click to select · Drag to move · Double-click to add a label',
  arrow: 'Drag to point something out · Hold Shift for a straight arrow',
  pen: 'Draw freely · Pen pressure supported',
  rectangle: 'Drag to frame a detail · Hold Shift for a square',
  text: 'Click anywhere on the screenshot to add text',
  redact: 'Drag over private details to cover them permanently on export',
  step: 'Click to add numbered steps · V to select and move them',
  magnifier: 'Click for a circular lens · Drag from its center to choose the size',
  blur: 'Drag to soften a region · Use Redact for sensitive information',
  crop: 'Drag to crop · Release to apply · Esc to cancel',
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

export function Editor() {
  const state = useDocument();
  const [capture, setCapture] = useState<CaptureRecord | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [style, setStyle] = useState<ObjectStyle>(DEFAULT_STYLE);
  const [zoom, setZoom] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [editing, setEditing] = useState<EditingText | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const navigationPending = useRef(false);
  const selected = state.doc.objects.find((object) => object.id === state.selectedId);
  const scale = zoom ?? fitScale;
  const hasTextDraft =
    !!editing &&
    editing.value !==
      (editing.object.type === 'arrow'
        ? editing.object.label
        : editing.object.type === 'text'
          ? editing.object.text
          : '');
  const hasUnsavedWork = !!image && (state.committed !== exportedDocument || hasTextDraft);

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
        setZoom(null);
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
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setError('Choose a PNG, JPEG, or WebP image.');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError('This file is too large. Choose an image smaller than 50 MB.');
        return;
      }
      if (
        hasUnsavedWork &&
        !window.confirm(
          'Replace this screenshot? Copy or download it first if you want to keep your current work.',
        )
      )
        return;
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
    },
    [openCapture, hasUnsavedWork],
  );

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
    if (!chrome?.storage?.local) return;
    void chrome.storage.local
      .get('drawingStyle')
      .then(({ drawingStyle: saved }) => {
        if (
          saved &&
          typeof saved === 'object' &&
          'color' in saved &&
          'width' in saved &&
          'sketch' in saved &&
          typeof saved.color === 'string' &&
          /^#[0-9a-f]{6}$/i.test(saved.color) &&
          typeof saved.width === 'number' &&
          saved.width >= 1 &&
          saved.width <= 16 &&
          typeof saved.sketch === 'boolean'
        )
          setStyle({ color: saved.color, width: saved.width, sketch: saved.sketch });
      })
      .catch(() => {
        /* Defaults still work when settings are unavailable. */
      });
  }, []);

  useEffect(() => {
    if (!image || !stage.current) return;
    const element = stage.current;
    const observer = new ResizeObserver(() => {
      const availableWidth = Math.max(180, element.clientWidth - 96);
      const availableHeight = Math.max(150, element.clientHeight - 128);
      setFitScale(
        Math.min(1, availableWidth / image.naturalWidth, availableHeight / image.naturalHeight),
      );
    });
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
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) =>
        Math.max(0.01, Math.min(4, (current ?? fitScale) * (event.deltaY > 0 ? 0.9 : 1.1))),
      );
    };
    // React delegates wheel events passively; native non-passive handling prevents browser zoom.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [image, fitScale]);

  useEffect(() => {
    if (editing) {
      textInput.current?.focus();
      textInput.current?.select();
    }
  }, [editing?.object.id]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedWork) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedWork]);

  function updateObject(object: DrawingObject) {
    state.commit({
      ...state.committed,
      objects: state.committed.objects.map((item) => (item.id === object.id ? object : item)),
    });
  }

  function changeStyle(change: Partial<ObjectStyle>) {
    const next = { ...style, ...change };
    setStyle(next);
    if (selected) updateObject({ ...selected, style: { ...selected.style, ...change } });
    if (chrome?.storage?.local)
      void chrome.storage.local.set({ drawingStyle: next }).catch(() => {
        /* Per-session settings remain available. */
      });
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    state.commit({
      ...state.committed,
      objects: state.committed.objects.filter((item) => item.id !== state.selectedId),
    });
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
    if (!capture || navigationPending.current) return;
    navigationPending.current = true;
    setReturning(true);
    setError('');
    try {
      await returnToWebsite({ url: capture.url, allowCaptureOpener });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not return to the website.');
    } finally {
      navigationPending.current = false;
      setReturning(false);
    }
  }

  async function addImage(file: File, center?: Point) {
    if (!image) {
      await importFile(file);
      return;
    }
    if (loading || busy || insertionPending.current) return;
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
    setEditing({
      object,
      value: object.type === 'arrow' ? object.label : object.type === 'text' ? object.text : '',
    });
  }

  function finishText() {
    if (!editing) return;
    const value = editing.value.trim();
    const object = editing.object;
    const next: DrawingObject =
      object.type === 'arrow'
        ? { ...object, label: value }
        : object.type === 'text'
          ? { ...object, text: value }
          : object;
    const existing = state.committed.objects.some((item) => item.id === next.id);
    if (existing) updateObject(next);
    else if (value)
      state.commit({ ...state.committed, objects: [...state.committed.objects, next] });
    setEditing(null);
    state.select(value || existing ? next.id : null);
  }

  async function rememberExport(blob: Blob, snapshot: EditorDocument) {
    if (!capture || !image) return;
    const crop = snapshot.crop;
    await saveRecent({
      ...capture,
      id: crypto.randomUUID(),
      image: blob,
      width: crop?.width ?? image.naturalWidth,
      height: crop?.height ?? image.naturalHeight,
      exportedAt: new Date().toISOString(),
    });
  }

  async function exportImage(action: 'copy' | 'download') {
    if (!image || !capture || busy || loading || insertionPending.current) return;
    setBusy(true);
    setError('');
    const snapshot = state.getCurrent();
    const pending = flattenImage(image, snapshot, assetStore.current.assets);
    try {
      if (action === 'copy') await copyImage(pending);
      const blob = await pending;
      if (action === 'download') downloadImage(blob, exportFilename(capture));
      setMessage(action === 'copy' ? 'Image copied. Ready to paste.' : 'PNG downloaded.');
      setExportedDocument(snapshot);
      try {
        await rememberExport(blob, snapshot);
      } catch {
        setError('Your image was exported, but Recent storage is full or unavailable.');
      }
    } catch (cause) {
      // Consume a possible rendering rejection even if clipboard failed before awaiting it.
      await pending.catch(() => undefined);
      setError(
        action === 'copy'
          ? 'Could not copy the image. Allow clipboard access, or use Download PNG.'
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
      if (isTextTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
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
      if (event.key === 'Escape') {
        setCancelToken((n) => n + 1);
        state.select(null);
        setTool('select');
        setEditing(null);
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
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/'),
      );
      if (file) {
        event.preventDefault();
        void addImage(file);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  const editingPoint =
    editing?.object.type === 'arrow'
      ? getArrowLabelLayout(
          { ...editing.object, label: editing.value || 'Add a label…' },
          state.doc.crop ??
            (image
              ? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }
              : undefined),
        ).rect
      : editing?.object.type === 'text'
        ? editing.object.position
        : null;
  const objectCount = state.doc.objects.length;

  return (
    <div
      className="editor-app"
      onDragOver={(event) => {
        event.preventDefault();
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
          const bounds = stage.current?.querySelector('canvas')?.getBoundingClientRect();
          const center =
            image &&
            bounds &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
              ? {
                  x: ((event.clientX - bounds.left) * image.naturalWidth) / bounds.width,
                  y: ((event.clientY - bounds.top) * image.naturalHeight) / bounds.height,
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
        busy={busy || loading || inserting}
        canReturn={!!image && capture?.mode !== 'import' && !!sourceWebsiteUrl(capture?.url)}
        returning={returning}
        onReturn={() => void backToWebsite()}
        onAddImage={() => layerInput.current?.click()}
        onOpenImage={() => fileInput.current?.click()}
        onDownloadImage={() => void exportImage('download')}
        onCopyImage={() => void exportImage('copy')}
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
          <main className="editor-workspace">
            <div className="toolbar-position">
              <Toolbar
                tool={tool}
                onChange={(next) => {
                  setTool(next);
                  if (next !== 'select') state.select(null);
                }}
              />
            </div>
            <Properties
              tool={tool}
              selected={selected}
              style={selected?.style ?? style}
              onStyle={changeStyle}
              onLabel={(label) => {
                if (selected?.type === 'arrow') updateObject({ ...selected, label });
              }}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onFontSize={(fontSize) => {
                if (selected?.type === 'text') updateObject({ ...selected, fontSize });
              }}
              onUpdate={updateObject}
              canBringForward={
                !!selected && canReorderObject(state.doc.objects, selected.id, 'forward')
              }
              canSendBackward={
                !!selected && canReorderObject(state.doc.objects, selected.id, 'backward')
              }
              onReorder={reorderSelected}
            />
            <div className="stage-scroll" ref={stage}>
              <div className="stage-content">
                <div
                  className="image-stage"
                  style={{ width: image.naturalWidth * scale, height: image.naturalHeight * scale }}
                >
                  <div className="image-caption">
                    <span>
                      <LockKeyhole size={11} />
                      SCREENSHOT
                    </span>
                    <span>
                      {image.naturalWidth} × {image.naturalHeight}
                    </span>
                  </div>
                  <DrawingCanvas
                    image={image}
                    assets={assetStore.current.assets}
                    doc={state.doc}
                    committed={state.committed}
                    getCurrent={state.getCurrent}
                    tool={tool}
                    setTool={setTool}
                    style={style}
                    scale={scale}
                    selectedId={state.selectedId}
                    select={state.select}
                    preview={state.preview}
                    commit={state.commit}
                    editText={startText}
                    cancelToken={cancelToken}
                  />
                  {editing && editingPoint && (
                    <textarea
                      className="inline-text-editor"
                      ref={textInput}
                      aria-label="Edit label"
                      placeholder="Add a label…"
                      style={{
                        left: Math.max(
                          0,
                          Math.min(image.naturalWidth * scale - 180, editingPoint.x * scale),
                        ),
                        top: Math.max(
                          0,
                          Math.min(image.naturalHeight * scale - 50, editingPoint.y * scale),
                        ),
                        fontSize: Math.max(
                          14,
                          (editing.object.type === 'text'
                            ? editing.object.fontSize
                            : editing.object.type === 'arrow'
                              ? (editing.object.labelFontSize ?? 20)
                              : 20) * scale,
                        ),
                      }}
                      value={editing.value}
                      onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                      onBlur={finishText}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEditing(null);
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
              <div className="zoom-controls">
                <IconButton
                  label="Zoom out"
                  disabled={scale <= 0.01}
                  onClick={() => setZoom(Math.max(0.01, scale / 1.2))}
                >
                  <Minus size={15} />
                </IconButton>
                <button className="zoom-value" onClick={() => setZoom(null)} title="Fit to screen">
                  {Math.round(scale * 100)}%<ChevronDown size={11} />
                </button>
                <IconButton
                  label="Zoom in"
                  disabled={scale >= 4}
                  onClick={() => setZoom(Math.min(4, scale * 1.2))}
                >
                  <Plus size={15} />
                </IconButton>
                <span className="divider" />
                <IconButton label="Fit to screen" onClick={() => setZoom(null)}>
                  <Expand size={15} />
                </IconButton>
              </div>
            </div>
          </main>
          <EditorFooter
            objectCount={objectCount}
            crop={state.doc.crop}
            onResetCrop={() => state.commit({ ...state.committed, crop: null })}
          />
        </>
      ) : (
        <EmptyState loading={loading} onOpenImage={() => fileInput.current?.click()} />
      )}
      {message && (
        <div className="toast" role="status">
          <span>
            <Check size={14} />
          </span>
          {message}
        </div>
      )}
      {(loading || inserting) && image && (
        <div className="loading-strip" role="status">
          {inserting ? 'Adding image…' : 'Opening image…'}
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
