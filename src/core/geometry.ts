import type { ArrowHandle, ArrowObject, DrawingObject, Point, Rect } from './model';
import { getArrowLabelLayout } from './arrow-label';

export { arrowLabelFontSize, hitTestArrowLabel, moveArrowLabelBy } from './arrow-label';

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const remaining = 1 - t;
  return {
    x: remaining * remaining * start.x + 2 * remaining * t * control.x + t * t * end.x,
    y: remaining * remaining * start.y + 2 * remaining * t * control.y + t * t * end.y,
  };
}

export function autoControl(start: Point, end: Point, straight = false): Point {
  const bend = straight ? 0 : 0.16;
  return {
    x: (start.x + end.x) / 2 - (end.y - start.y) * bend,
    y: (start.y + end.y) / 2 + (end.x - start.x) * bend,
  };
}

export function getArrowLabelPosition(arrow: ArrowObject): Point {
  return add(quadraticPoint(arrow.start, arrow.control, arrow.end, 0.5), arrow.labelOffset);
}

export function textDimensions(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split('\n');
  return {
    width: Math.max(1, ...lines.map((line) => line.length)) * fontSize * 0.62,
    height: Math.max(1, lines.length) * fontSize * 1.3,
  };
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function clampRect(rect: Rect, width: number, height: number): Rect {
  const normalized = normalizeRect(rect, { x: rect.x + rect.width, y: rect.y + rect.height });
  const x = clamp(normalized.x, 0, Math.max(0, width));
  const y = clamp(normalized.y, 0, Math.max(0, height));
  return {
    x,
    y,
    width: Math.max(0, clamp(normalized.x + normalized.width, 0, Math.max(0, width)) - x),
    height: Math.max(0, clamp(normalized.y + normalized.height, 0, Math.max(0, height)) - y),
  };
}

export function moveObject<T extends DrawingObject>(object: T, delta: Point): T {
  switch (object.type) {
    case 'arrow':
      return {
        ...object,
        start: add(object.start, delta),
        end: add(object.end, delta),
        control: add(object.control, delta),
        labelOffset: { ...object.labelOffset },
      };
    case 'pen':
      return {
        ...object,
        points: object.points.map((point) => ({ ...point, ...add(point, delta) })),
      };
    case 'text':
      return { ...object, position: add(object.position, delta) };
    case 'step':
    case 'magnifier':
      return { ...object, center: add(object.center, delta) };
    case 'rectangle':
    case 'redact':
    case 'blur':
    case 'image':
      return { ...object, rect: { ...object.rect, ...add(object.rect, delta) } };
  }
}

export function moveArrowHandle(
  arrow: ArrowObject,
  handle: ArrowHandle,
  point: Point,
): ArrowObject {
  if (handle === 'label') {
    const middle = quadraticPoint(arrow.start, arrow.control, arrow.end, 0.5);
    return { ...arrow, labelOffset: { x: point.x - middle.x, y: point.y - middle.y } };
  }
  if (handle === 'control') return { ...arrow, control: { ...point } };
  // Preserve the bend relative to the chord when either endpoint is dragged.
  const previous = arrow[handle];
  return {
    ...arrow,
    [handle]: { ...point },
    control: add(arrow.control, { x: (point.x - previous.x) / 2, y: (point.y - previous.y) / 2 }),
  };
}

export function objectBounds(object: DrawingObject, sceneBounds?: Rect): Rect {
  switch (object.type) {
    case 'arrow': {
      const points = [object.start, object.end];
      for (const axis of ['x', 'y'] as const) {
        const divisor = object.start[axis] - 2 * object.control[axis] + object.end[axis];
        if (Math.abs(divisor) < 0.00001) continue;
        const t = (object.start[axis] - object.control[axis]) / divisor;
        if (t > 0 && t < 1)
          points.push(quadraticPoint(object.start, object.control, object.end, t));
      }
      const head = arrowHeadPoints(object);
      points.push(...head);
      let bounds = expand(
        boundsOfPoints(points),
        object.style.width / 2 + (object.style.sketch ? 2 : 0),
      );
      if (object.label.trim())
        bounds = union(bounds, getArrowLabelLayout(object, sceneBounds).rect);
      return bounds;
    }
    case 'pen':
      return expand(boundsOfPoints(object.points), object.style.width);
    case 'text':
      return { ...object.position, ...textDimensions(object.text, object.fontSize) };
    case 'rectangle':
      return expand(object.rect, object.style.width / 2 + (object.style.sketch ? 2 : 0));
    case 'step':
    case 'magnifier':
      return expand(
        {
          x: object.center.x - object.radius,
          y: object.center.y - object.radius,
          width: object.radius * 2,
          height: object.radius * 2,
        },
        object.style.width / 2,
      );
    case 'redact':
    case 'blur':
    case 'image':
      return { ...object.rect };
  }
}

/** All tolerances are source pixels; the editor divides screen tolerances by zoom. */
export function hitTestObject(
  object: DrawingObject,
  point: Point,
  tolerance = 6,
  sceneBounds?: Rect,
): boolean {
  const padding = tolerance + object.style.width / 2;
  if (!contains(expand(objectBounds(object, sceneBounds), tolerance), point)) return false;
  switch (object.type) {
    case 'arrow': {
      if (
        object.label.trim() &&
        contains(expand(getArrowLabelLayout(object, sceneBounds).rect, tolerance), point)
      )
        return true;
      // Dense sampling follows tight bends too, while keeping pointer work bounded.
      const length = distance(object.start, object.control) + distance(object.control, object.end);
      const steps = Math.min(256, Math.max(24, Math.ceil(length / 8)));
      let previous = object.start;
      for (let index = 1; index <= steps; index++) {
        const next = quadraticPoint(object.start, object.control, object.end, index / steps);
        if (distanceToSegment(point, previous, next) <= padding) return true;
        previous = next;
      }
      return arrowHeadPoints(object).some(
        (head) => distanceToSegment(point, object.end, head) <= padding,
      );
    }
    case 'pen': {
      const first = object.points[0];
      if (!first) return false;
      if (object.points.length === 1)
        return distance(point, first) <= tolerance + object.style.width;
      for (let index = 1; index < object.points.length; index++) {
        const previous = object.points[index - 1];
        const next = object.points[index];
        if (
          previous &&
          next &&
          distanceToSegment(point, previous, next) <= tolerance + object.style.width
        )
          return true;
      }
      return false;
    }
    case 'text':
    case 'redact':
    case 'blur':
    case 'image':
      return true;
    case 'step':
    case 'magnifier':
      return distance(object.center, point) <= object.radius + padding;
    case 'rectangle': {
      const { x, y, width, height } = object.rect;
      return (
        distanceToSegment(point, { x, y }, { x: x + width, y }) <= padding ||
        distanceToSegment(point, { x: x + width, y }, { x: x + width, y: y + height }) <= padding ||
        distanceToSegment(point, { x: x + width, y: y + height }, { x, y: y + height }) <=
          padding ||
        distanceToSegment(point, { x, y: y + height }, { x, y }) <= padding
      );
    }
  }
}

/** Open arrowhead follows the final curve tangent, including sharp endpoint edits. */
export function arrowHeadPoints(arrow: ArrowObject): [Point, Point] {
  const tangent = distance(arrow.end, arrow.control) > 0.001 ? arrow.control : arrow.start;
  const angle = Math.atan2(arrow.end.y - tangent.y, arrow.end.x - tangent.x);
  const headLength = Math.min(
    Math.max(14, arrow.style.width * 4.5),
    Math.max(6, distance(arrow.start, arrow.end) * 0.4),
  );
  const opening = Math.PI / 7;
  return [angle - opening, angle + opening].map((direction) => ({
    x: arrow.end.x - Math.cos(direction) * headLength,
    y: arrow.end.y - Math.sin(direction) * headLength,
  })) as [Point, Point];
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function boundsOfPoints(points: Point[]): Rect {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function expand(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
