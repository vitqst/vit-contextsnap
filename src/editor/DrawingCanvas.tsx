import { hitTestArrowLabel, moveArrowLabelBy } from '../core/arrow-label';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
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

interface Props {
  image: HTMLImageElement;
  assets: ImageAssets;
  doc: EditorDocument;
  committed: EditorDocument;
  getCurrent: () => EditorDocument;
  tool: Tool;
  setTool: (tool: Tool) => void;
  style: ObjectStyle;
  brush: BrushSettings;
  arrowMode: 'straight' | 'curved';
  scale: number;
  selectedId: string | null;
  select: (id: string | null) => void;
  preview: (doc: EditorDocument | null) => void;
  commit: (doc: EditorDocument) => void;
  editText: (object: DrawingObject) => void;
  cancelToken: number;
}

interface Gesture {
  kind: 'draw' | 'move' | 'handle' | 'crop' | 'resize' | 'label';
  start: Point;
  object?: DrawingObject;
  handle?: ArrowHandle;
  imageHandle?: ImageHandle;
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
  selected: DrawingObject | undefined,
  scale: number,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  if (doc.crop) {
    const { x, y, width: w, height: h } = doc.crop;
    ctx.fillStyle = '#24223388';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(x, y, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(x, y, w, h);
  }
  if (!selected) return;
  ctx.save();
  ctx.strokeStyle = '#7966df';
  ctx.lineWidth = 1.25 / scale;
  const sceneBounds = doc.crop ?? { x: 0, y: 0, width, height };
  const bounds = objectBounds(selected, sceneBounds);
  const pad = 7 / scale;
  ctx.setLineDash([4 / scale, 3 / scale]);
  ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
  ctx.setLineDash([]);
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
    const side = 9 / scale;
    ctx.fillStyle = '#ffffff';
    for (const point of Object.values(imageHandles(selected.rect))) {
      ctx.fillRect(point.x - side / 2, point.y - side / 2, side, side);
      ctx.strokeRect(point.x - side / 2, point.y - side / 2, side, side);
    }
  }
  ctx.restore();
}

export function DrawingCanvas(props: Props) {
  const {
    image,
    assets,
    doc,
    getCurrent,
    tool,
    setTool,
    style,
    brush,
    arrowMode,
    scale,
    selectedId,
    select,
    preview,
    commit,
    editText,
    cancelToken,
  } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      const overlay = overlayRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        drawScene(ctx, image, doc.objects, doc.crop ?? { x: 0, y: 0, width, height }, assets);
      }
      if (overlay)
        drawOverlay(
          overlay,
          doc,
          doc.objects.find((item) => item.id === selectedId),
          scale,
          width,
          height,
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [doc, image, assets, width, height, scale, selectedId]);

  useEffect(() => {
    gesture.current = null;
    preview(null);
  }, [cancelToken, preview]);

  function pointAt(clientX: number, clientY: number, clamp = true): Point {
    const bounds = canvasRef.current!.getBoundingClientRect();
    const x = ((clientX - bounds.left) * width) / bounds.width;
    const y = ((clientY - bounds.top) * height) / bounds.height;
    return clamp
      ? { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) }
      : { x, y };
  }

  function topObject(point: Point, includeInterior = false) {
    const current = getCurrent();
    return objectsInPaintOrder(current.objects)
      .reverse()
      .find(
        (object) =>
          hitTestObject(object, point, 8 / scale, current.crop ?? { x: 0, y: 0, width, height }) ||
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
    const sceneBounds = committed.crop ?? { x: 0, y: 0, width, height };
    if (tool === 'select') {
      const selected = committed.objects.find((object) => object.id === selectedId);
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
      gesture.current = {
        kind: 'crop',
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
    let point = pointAt(
      event.clientX,
      event.clientY,
      active.kind === 'draw' || active.kind === 'crop',
    );
    active.moved ||= distance(point, active.start) > 1 / scale;
    let next = active.doc;
    if (active.kind === 'crop') {
      const rect = normalizeRect(active.start, point);
      next = { ...active.doc, crop: clampRect(rect, width, height) };
    } else if (active.object) {
      let object = active.object;
      if (active.kind === 'label') {
        const delta = { x: point.x - active.start.x, y: point.y - active.start.y };
        const bounds = active.doc.crop ?? { x: 0, y: 0, width, height };
        object =
          object.type === 'arrow'
            ? moveArrowLabelBy(object, delta, bounds)
            : moveShapeLabelBy(object, delta, bounds);
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
    if (active.kind === 'crop') {
      if (next.crop && next.crop.width >= 4 && next.crop.height >= 4) {
        const x = Math.round(next.crop.x);
        const y = Math.round(next.crop.y);
        const crop: Rect = {
          x,
          y,
          width: Math.min(width, Math.round(next.crop.x + next.crop.width)) - x,
          height: Math.min(height, Math.round(next.crop.y + next.crop.height)) - y,
        };
        commit({ ...next, crop });
      } else preview(null);
      setTool('select');
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
    <div className="canvas-sheet" style={{ width: width * scale, height: height * scale }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        data-testid="drawing-canvas"
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
          const hit = topObject(pointAt(event.clientX, event.clientY), true);
          if (hit) {
            select(hit.id);
            editText(hit);
          }
        }}
      />
      <canvas
        ref={overlayRef}
        width={width}
        height={height}
        className="selection-layer"
        aria-hidden="true"
      />
    </div>
  );
}
