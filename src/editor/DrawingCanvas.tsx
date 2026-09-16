import { hitTestArrowLabel, moveArrowLabelBy } from '../core/arrow-label';
import {
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  newObjectBase,
  nextStepNumber,
  type ArrowHandle,
  type DrawingObject,
  type EditorDocument,
  type ObjectStyle,
  type Point,
  type Rect,
  type Tool,
  type BrushSettings,
} from '../core/model';
import {
  autoControl,
  clampRect,
  distance,
  hitTestObject,
  moveArrowHandle,
  moveObject,
  normalizeRect,
  objectBounds,
} from '../core/geometry';
import { arrowHandles } from '../core/arrow-handles';
import { sampleStrokePoint } from '../core/brush';
import { createSticky, resizeSticky, hitTestShapeLabel, moveShapeLabelBy } from '../core/notes';
import { objectsInPaintOrder } from '../core/layers';
import {
  imageHandles,
  hitTestImageHandle,
  resizeImageRect,
  type ImageHandle,
} from '../core/image-geometry';
import type { ImageAssets } from './image-assets';
import { drawScene } from './render';
import type { Viewport } from './viewport';
import {
  cropHandles,
  hitTestCropHandle,
  magnifierHandles,
  moveCrop,
  resizeCrop,
  resizeMagnifier,
  type CropHandle,
} from '../core/tool-resize';

interface Props {
  image: HTMLImageElement;
  bounds: Rect;
  camera: Viewport;
  viewportSize: { width: number; height: number };
  assets: ImageAssets;
  doc: EditorDocument;
  committed: EditorDocument;
  getCurrent: () => EditorDocument;
  getPreview: () => EditorDocument;
  tool: Tool;
  setTool: (tool: Tool) => void;
  style: ObjectStyle;
  brush: BrushSettings;
  arrowMode: 'straight' | 'curved';
  scale: number;
  selectedId: string | null;
  selectedIds: readonly string[];
  select: (id: string | null, toggle?: boolean) => void;
  preview: (doc: EditorDocument | null) => void;
  commit: (doc: EditorDocument) => void;
  editText: (object: DrawingObject) => void;
  cancelToken: number;
}

interface Gesture {
  kind: 'draw' | 'move' | 'handle' | 'crop' | 'crop-resize' | 'crop-move' | 'resize' | 'label';
  start: Point;
  object?: DrawingObject;
  handle?: ArrowHandle;
  imageHandle?: ImageHandle;
  cropHandle?: CropHandle;
  doc: EditorDocument;
  latest: EditorDocument;
  moved: boolean;
  pointerId: number;
}

function replaceObject(doc: EditorDocument, object: DrawingObject): EditorDocument {
  return { ...doc, objects: doc.objects.map((item) => (item.id === object.id ? object : item)) };
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  doc: EditorDocument,
  selectedObjects: readonly DrawingObject[],
  scale: number,
  width: number,
  height: number,
  origin: Point,
  sceneBounds: Rect,
  tool: Tool,
) {
  ctx.clearRect(origin.x, origin.y, width, height);
  if (doc.crop) {
    const { x, y, width: w, height: h } = doc.crop;
    ctx.fillStyle = '#24223388';
    ctx.beginPath();
    ctx.rect(origin.x, origin.y, width, height);
    ctx.rect(x, y, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(x, y, w, h);
    if (tool === 'crop') {
      ctx.save();
      ctx.strokeStyle = '#7966df';
      drawSquareHandles(ctx, Object.values(cropHandles(doc.crop)), scale);
      ctx.restore();
    }
  }
  if (!selectedObjects.length) return;
  ctx.save();
  ctx.strokeStyle = '#7966df';
  ctx.lineWidth = 1.25 / scale;
  const pad = 7 / scale;
  ctx.setLineDash([4 / scale, 3 / scale]);
  for (const object of selectedObjects) {
    const bounds = objectBounds(object, sceneBounds);
    ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
  }
  ctx.setLineDash([]);
  // Multiple selection currently supports deletion, not one-object resize handles.
  if (selectedObjects.length !== 1) {
    ctx.restore();
    return;
  }
  const selected = selectedObjects[0]!;
  if (selected.type === 'arrow') {
    arrowHandles(selected, sceneBounds, scale).forEach(([handle, point]) => {
      ctx.beginPath();
      ctx.fillStyle = handle === 'control' ? '#ede8ff' : '#ffffff';
      ctx.arc(point.x, point.y, (handle === 'control' ? 5.5 : 5) / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  if (selected.type === 'image' || selected.type === 'sticky' || selected.type === 'rectangle') {
    drawSquareHandles(ctx, Object.values(imageHandles(selected.rect)), scale);
  }
  if (selected.type === 'magnifier') {
    drawSquareHandles(ctx, magnifierHandles(selected), scale);
  }
  ctx.restore();
}

function drawSquareHandles(ctx: CanvasRenderingContext2D, points: Point[], scale: number) {
  const side = 9 / scale;
  ctx.fillStyle = '#ffffff';
  for (const point of points) {
    ctx.fillRect(point.x - side / 2, point.y - side / 2, side, side);
    ctx.strokeRect(point.x - side / 2, point.y - side / 2, side, side);
  }
}

export function DrawingCanvas(props: Props) {
  const {
    image,
    bounds,
    camera,
    viewportSize,
    assets,
    doc,
    getCurrent,
    getPreview,
    tool,
    setTool,
    style,
    brush,
    arrowMode,
    scale,
    selectedId,
    selectedIds,
    select,
    preview: updatePreview,
    commit,
    editText,
    cancelToken,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const paintRef = useRef<(() => void) | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [pixelRatio, setPixelRatio] = useState(window.devicePixelRatio);
  const { width, height } = bounds;
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const rasterWidth = Math.max(1, Math.round(viewportSize.width * density));
  const rasterHeight = Math.max(1, Math.round(viewportSize.height * density));
  const schedulePaint = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paintRef.current?.();
    });
  }, []);
  const preview = useCallback(
    (next: EditorDocument | null) => {
      updatePreview(next);
      // Queue directly from input instead of waiting for a React preview render.
      // Reuse any pending frame and read the latest accepted draft when it runs.
      schedulePaint();
    },
    [updatePreview, schedulePaint],
  );

  useEffect(() => {
    const updateDensity = () => setPixelRatio(window.devicePixelRatio);
    const query = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    query.addEventListener('change', updateDensity);
    window.addEventListener('resize', updateDensity);
    return () => {
      query.removeEventListener('change', updateDensity);
      window.removeEventListener('resize', updateDensity);
    };
  }, [pixelRatio]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      paintRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    // Keep one pending frame, updated with the latest document. Dimensions are
    // assigned only here, immediately before painting, never by a React commit
    // that would expose an empty bitmap while waiting for requestAnimationFrame.
    paintRef.current = () => {
      const current = getPreview();
      for (const canvas of [canvasRef.current, overlayRef.current]) {
        if (!canvas) continue;
        if (canvas.width !== rasterWidth) canvas.width = rasterWidth;
        if (canvas.height !== rasterHeight) canvas.height = rasterHeight;
      }
      const ctx = canvasRef.current?.getContext('2d');
      const overlay = overlayRef.current?.getContext('2d');
      if (ctx) {
        ctx.setTransform(
          scale * density,
          0,
          0,
          scale * density,
          camera.x * density,
          camera.y * density,
        );
        // Explicit raster filtering avoids the WebView's CSS image resampling.
        // Only visible display pixels are allocated, regardless of document size.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        drawScene(ctx, image, current.objects, current.crop ?? undefined, assets, {
          expandedBackground: false,
          previewEffects: true,
        });
      }
      if (overlay) {
        overlay.resetTransform();
        overlay.clearRect(0, 0, rasterWidth, rasterHeight);
        overlay.setTransform(
          scale * density,
          0,
          0,
          scale * density,
          camera.x * density,
          camera.y * density,
        );
        drawOverlay(
          overlay,
          current,
          current.objects.filter((item) => selectedIds.includes(item.id)),
          scale,
          viewportSize.width / scale,
          viewportSize.height / scale,
          { x: -camera.x / scale, y: -camera.y / scale },
          current.crop ?? bounds,
          tool,
        );
      }
    };
    schedulePaint();
  }, [
    doc,
    getPreview,
    schedulePaint,
    image,
    assets,
    width,
    height,
    bounds.x,
    bounds.y,
    scale,
    selectedIds,
    tool,
    rasterWidth,
    rasterHeight,
    density,
    camera.x,
    camera.y,
    viewportSize.width,
    viewportSize.height,
  ]);

  useEffect(() => {
    gesture.current = null;
    preview(null);
  }, [cancelToken, preview]);

  function pointAt(clientX: number, clientY: number, clamp = false): Point {
    const frame = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - frame.left - camera.x) / scale;
    const y = (clientY - frame.top - camera.y) / scale;
    return clamp
      ? {
          x: Math.max(bounds.x, Math.min(bounds.x + width, x)),
          y: Math.max(bounds.y, Math.min(bounds.y + height, y)),
        }
      : { x, y };
  }

  function topObject(point: Point, includeInterior = false) {
    const current = getCurrent();
    return objectsInPaintOrder(current.objects)
      .reverse()
      .find(
        (object) =>
          hitTestObject(object, point, 8 / scale, current.crop ?? bounds) ||
          (includeInterior &&
            object.type === 'rectangle' &&
            point.x >= object.rect.x &&
            point.x <= object.rect.x + object.rect.width &&
            point.y >= object.rect.y &&
            point.y <= object.rect.y + object.rect.height),
      );
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    if (gesture.current) return;
    // Commit an active label before creating a new gesture on the image.
    if (
      document.activeElement instanceof HTMLTextAreaElement ||
      document.activeElement instanceof HTMLInputElement
    ) {
      document.activeElement.blur();
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointAt(event.clientX, event.clientY);
    // blur() above can synchronously commit text: read the document after that commit.
    const committed = getCurrent();
    const sceneBounds = committed.crop ?? bounds;
    if (tool === 'select') {
      if (event.shiftKey) {
        // Toggle before handle/label hit testing; a Shift gesture never mutates geometry.
        select(topObject(point)?.id ?? null, true);
        return;
      }
      const selected = committed.objects.find((object) => object.id === selectedId);
      if (
        selected?.type === 'magnifier' &&
        magnifierHandles(selected).some(
          (handle) => distance(point, handle) <= Math.min(11 / scale, selected.radius / 3),
        )
      ) {
        gesture.current = {
          kind: 'resize',
          start: point,
          object: selected,
          doc: committed,
          latest: committed,
          moved: false,
          pointerId: event.pointerId,
        };
        return;
      }
      if (
        selected?.type === 'image' ||
        selected?.type === 'sticky' ||
        selected?.type === 'rectangle'
      ) {
        const handle = hitTestImageHandle(selected.rect, point, 11 / scale);
        if (handle) {
          gesture.current = {
            kind: 'resize',
            start: point,
            object: selected,
            imageHandle: handle,
            doc: committed,
            latest: committed,
            moved: false,
            pointerId: event.pointerId,
          };
          return;
        }
      }
      if (selected?.type === 'arrow') {
        const handles = arrowHandles(selected, sceneBounds, scale);
        const handle = handles.find(([, position]) => distance(point, position) < 11 / scale);
        if (handle) {
          gesture.current = {
            kind: 'handle',
            start: point,
            object: selected,
            handle: handle[0],
            doc: committed,
            latest: committed,
            moved: false,
            pointerId: event.pointerId,
          };
          return;
        }
      }
      const hit = topObject(point);
      select(hit?.id ?? null);
      if (hit)
        gesture.current = {
          kind: (
            hit.type === 'arrow'
              ? hitTestArrowLabel(hit, point, sceneBounds)
              : hitTestShapeLabel(hit, point, sceneBounds)
          )
            ? 'label'
            : 'move',
          start: point,
          object: hit,
          doc: committed,
          latest: committed,
          moved: false,
          pointerId: event.pointerId,
        };
      return;
    }
    if (tool === 'text') {
      const object: DrawingObject = {
        ...newObjectBase(style),
        type: 'text',
        position: point,
        text: '',
        fontSize: 24,
      };
      editText(object);
      setTool('select');
      return;
    }
    if (tool === 'crop') {
      select(null);
      const cropHandle = committed.crop
        ? hitTestCropHandle(committed.crop, point, 11 / scale)
        : null;
      const inside =
        committed.crop &&
        point.x >= committed.crop.x &&
        point.x <= committed.crop.x + committed.crop.width &&
        point.y >= committed.crop.y &&
        point.y <= committed.crop.y + committed.crop.height;
      gesture.current = {
        kind: cropHandle ? 'crop-resize' : inside ? 'crop-move' : 'crop',
        cropHandle: cropHandle ?? undefined,
        start: point,
        doc: committed,
        latest: committed,
        moved: false,
        pointerId: event.pointerId,
      };
      return;
    }
    const base = newObjectBase(style);
    let object: DrawingObject;
    if (tool === 'arrow') {
      object = {
        ...base,
        type: 'arrow',
        start: point,
        end: point,
        control: point,
        mode: arrowMode,
        label: '',
        labelOffset: { x: 0, y: 0 },
      };
    } else if (tool === 'pen') {
      object = {
        ...base,
        type: 'pen',
        points: [sampleStrokePoint(point, event)],
        brush: { ...brush },
      };
    } else if (tool === 'sticky') {
      object = createSticky(point, style, sceneBounds);
    } else if (tool === 'step') {
      object = {
        ...base,
        type: 'step',
        center: point,
        radius: 22,
        number: nextStepNumber(committed.objects),
      };
    } else if (tool === 'magnifier') {
      object = { ...base, type: 'magnifier', center: point, radius: 72, zoom: 2 };
    } else if (tool === 'blur') {
      object = { ...base, type: 'blur', rect: { ...point, width: 0, height: 0 }, strength: 12 };
    } else {
      object = { ...base, type: tool, rect: { ...point, width: 0, height: 0 } };
    }
    const next = { ...committed, objects: [...committed.objects, object] };
    gesture.current = {
      kind: 'draw',
      start: point,
      object,
      doc: committed,
      latest: next,
      moved: false,
      pointerId: event.pointerId,
    };
    select(null);
    preview(next);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>, released = false) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    // An async image insertion, undo, or property edit can invalidate a gesture's snapshot.
    if (active.doc !== getCurrent()) {
      gesture.current = null;
      preview(null);
      return;
    }
    let point = pointAt(event.clientX, event.clientY, active.kind === 'crop');
    active.moved ||= distance(point, active.start) > 1 / scale;
    let next = active.doc;
    if (active.kind === 'crop') {
      const rect = normalizeRect(active.start, point);
      const crop = clampRect(
        { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y },
        width,
        height,
      );
      next = { ...active.doc, crop: { ...crop, x: crop.x + bounds.x, y: crop.y + bounds.y } };
    } else if (active.kind === 'crop-resize' && active.doc.crop && active.cropHandle) {
      next = {
        ...active.doc,
        crop: resizeCrop(
          active.doc.crop,
          active.cropHandle,
          { x: point.x - active.start.x, y: point.y - active.start.y },
          bounds,
        ),
      };
    } else if (active.kind === 'crop-move' && active.doc.crop) {
      next = {
        ...active.doc,
        crop: moveCrop(
          active.doc.crop,
          { x: point.x - active.start.x, y: point.y - active.start.y },
          bounds,
        ),
      };
    } else if (active.object) {
      let object = active.object;
      if (active.kind === 'label') {
        const delta = { x: point.x - active.start.x, y: point.y - active.start.y };
        const labelBounds = active.doc.crop ?? undefined;
        object =
          object.type === 'arrow'
            ? moveArrowLabelBy(object, delta, labelBounds)
            : moveShapeLabelBy(object, delta, labelBounds);
      } else if (active.kind === 'resize' && object.type === 'rectangle' && active.imageHandle) {
        const corners = imageHandles(object.rect);
        const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const;
        object = { ...object, rect: normalizeRect(corners[opposite[active.imageHandle]], point) };
      } else if (active.kind === 'move') {
        object = moveObject(object, { x: point.x - active.start.x, y: point.y - active.start.y });
      } else if (active.kind === 'resize' && object.type === 'image' && active.imageHandle) {
        object = { ...object, rect: resizeImageRect(object.rect, active.imageHandle, point) };
      } else if (active.kind === 'resize' && object.type === 'sticky' && active.imageHandle) {
        object = resizeSticky(object, active.imageHandle, point);
      } else if (active.kind === 'resize' && object.type === 'magnifier') {
        object = resizeMagnifier(object, active.start, point);
      } else if (active.kind === 'handle' && object.type === 'arrow' && active.handle) {
        if (active.handle === 'control') {
          point = {
            x: object.control.x + 2 * (point.x - active.start.x),
            y: object.control.y + 2 * (point.y - active.start.y),
          };
        }
        object = moveArrowHandle(object, active.handle, point);
      } else if (active.kind === 'draw') {
        if (object.type === 'arrow') {
          object = {
            ...object,
            end: point,
            mode: event.shiftKey ? 'straight' : arrowMode,
            control: autoControl(active.start, point),
          };
        } else if (object.type === 'pen') {
          const latest = active.latest.objects.find((item) => item.id === object.id);
          const previous = latest?.type === 'pen' ? latest.points : object.points;
          const points = [...previous];
          const coalesced = released ? [] : (event.nativeEvent.getCoalescedEvents?.() ?? []);
          for (const sample of coalesced.length ? coalesced : [event.nativeEvent]) {
            points.push(
              sampleStrokePoint(
                pointAt(sample.clientX, sample.clientY),
                sample,
                points.at(-1),
                released,
              ),
            );
          }
          object = { ...object, points };
        } else if (object.type === 'sticky' && active.moved) {
          const rect = normalizeRect(active.start, point);
          object = {
            ...object,
            rect: { ...rect, width: Math.max(80, rect.width), height: Math.max(60, rect.height) },
          };
        } else if (object.type === 'magnifier') {
          if (active.moved)
            object = {
              ...object,
              radius: Math.max(32, Math.min(180, distance(active.start, point))),
            };
        } else if (object.type === 'step') {
          object = { ...object, center: point };
        } else if (
          object.type === 'rectangle' ||
          object.type === 'redact' ||
          object.type === 'blur'
        ) {
          if (event.shiftKey) {
            const side = Math.min(
              Math.abs(point.x - active.start.x),
              Math.abs(point.y - active.start.y),
            );
            point = {
              x: active.start.x + Math.sign(point.x - active.start.x) * side,
              y: active.start.y + Math.sign(point.y - active.start.y) * side,
            };
          }
          object = { ...object, rect: normalizeRect(active.start, point) };
        }
      }
      next =
        active.kind === 'draw'
          ? { ...active.doc, objects: [...active.doc.objects, object] }
          : replaceObject(active.doc, object);
    }
    active.latest = next;
    preview(next);
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    // Include the final pointer position even when no move was dispatched at that position.
    onPointerMove(event, true);
    if (!gesture.current) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const next = active.latest;
    if (active.kind === 'crop' || active.kind === 'crop-resize' || active.kind === 'crop-move') {
      if (active.moved && next.crop && next.crop.width >= 4 && next.crop.height >= 4) {
        const x = Math.round(next.crop.x);
        const y = Math.round(next.crop.y);
        const crop: Rect = {
          x,
          y,
          // Gesture geometry already clamps new crops and preserves existing ones
          // whose expanded content was removed. Do not clip them a second time.
          width: Math.round(next.crop.x + next.crop.width) - x,
          height: Math.round(next.crop.y + next.crop.height) - y,
        };
        commit({ ...next, crop });
      } else preview(null);
      return;
    }
    if (
      active.moved ||
      (active.kind === 'draw' &&
        (active.object?.type === 'pen' ||
          active.object?.type === 'step' ||
          active.object?.type === 'sticky' ||
          active.object?.type === 'magnifier'))
    ) {
      commit(next);
      if (active.object) select(active.object.id);
      if (active.kind === 'draw' && active.object?.type === 'sticky') {
        const card = next.objects.find((item) => item.id === active.object!.id);
        if (card) editText(card);
      }
      if (active.kind === 'draw' && active.object?.type !== 'pen' && active.object?.type !== 'step')
        setTool('select');
    } else preview(null);
  }

  return (
    <div className="canvas-sheet">
      <canvas
        ref={canvasRef}
        data-testid="drawing-canvas"
        data-world-x={bounds.x}
        data-world-y={bounds.y}
        data-world-width={bounds.width}
        data-world-height={bounds.height}
        aria-label="Screenshot drawing canvas"
        style={{ cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={(event) => {
          if (event.pointerId !== gesture.current?.pointerId) return;
          gesture.current = null;
          preview(null);
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current?.pointerId === event.pointerId) {
            gesture.current = null;
            preview(null);
          }
        }}
        onDoubleClick={(event) => {
          if (event.shiftKey) return;
          const hit = topObject(pointAt(event.clientX, event.clientY), true);
          if (hit) {
            select(hit.id);
            editText(hit);
          }
        }}
      />
      <canvas ref={overlayRef} className="selection-layer" aria-hidden="true" />
    </div>
  );
}
