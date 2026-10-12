import { arrowControl } from './arrows';
import type { ArrowObject, Point } from './model';

export interface ArrowHead {
  tip: Point;
  corners: [Point, Point];
}

export function arrowDirection(arrow: ArrowObject): 'one-way' | 'two-way' {
  return arrow.direction ?? 'one-way';
}

export function arrowAppearance(arrow: ArrowObject): 'standard' | 'bold' {
  return arrow.appearance ?? 'standard';
}

export function arrowHeads(arrow: ArrowObject): ArrowHead[] {
  const control = arrowControl(arrow);
  const heads = [headAt(arrow, arrow.end, control)];
  if (arrowDirection(arrow) === 'two-way') heads.unshift(headAt(arrow, arrow.start, control));
  return heads;
}

/** Closed filled silhouette for straight or quadratic Bold arrows. */
export function boldArrowOutline(arrow: ArrowObject): Point[] {
  const control = arrowControl(arrow);
  const curveLength = approximateLength(arrow.start, control, arrow.end);
  const chord = distance(arrow.start, arrow.end);
  const headLength = Math.min(Math.max(22, arrow.style.width * 5.5), Math.max(10, chord * 0.34));
  const headFraction = Math.min(0.34, Math.max(0.12, headLength / Math.max(1, curveLength)));
  const headHalf = Math.min(Math.max(12, arrow.style.width * 2.8), Math.max(6, chord * 0.22));
  const shaftHalf = Math.max(1.5, arrow.style.width * 0.72);
  const twoWay = arrowDirection(arrow) === 'two-way';
  const startT = twoWay ? Math.min(0.4, headFraction) : 0;
  const endT = Math.max(0.6, 1 - headFraction);
  const steps = 18;
  const startFrame = frameAt(arrow.start, control, arrow.end, startT);
  const endFrame = frameAt(arrow.start, control, arrow.end, endT);
  const points: Point[] = [arrow.start];

  if (twoWay) {
    points.push(offset(startFrame.point, startFrame.normal, headHalf));
    points.push(offset(startFrame.point, startFrame.normal, shaftHalf));
  }
  for (let index = 1; index <= steps; index++) {
    const t = startT + ((endT - startT) * index) / steps;
    const frame = frameAt(arrow.start, control, arrow.end, t);
    const taper = twoWay ? 1 : t / Math.max(endT, 0.0001);
    points.push(offset(frame.point, frame.normal, shaftHalf * taper));
  }
  points.push(offset(endFrame.point, endFrame.normal, headHalf), arrow.end);
  points.push(offset(endFrame.point, endFrame.normal, -headHalf));
  for (let index = steps; index >= 1; index--) {
    const t = startT + ((endT - startT) * index) / steps;
    const frame = frameAt(arrow.start, control, arrow.end, t);
    const taper = twoWay ? 1 : t / Math.max(endT, 0.0001);
    points.push(offset(frame.point, frame.normal, -shaftHalf * taper));
  }
  if (twoWay) points.push(offset(startFrame.point, startFrame.normal, -headHalf));
  points.push(arrow.start);
  return points;
}

function headAt(arrow: ArrowObject, tip: Point, tangent: Point): ArrowHead {
  const angle = Math.atan2(tip.y - tangent.y, tip.x - tangent.x);
  const headLength = Math.min(
    Math.max(14, arrow.style.width * 4.5),
    Math.max(6, distance(arrow.start, arrow.end) * 0.4),
  );
  const opening = Math.PI / 7;
  const corners = [angle - opening, angle + opening].map((direction) => ({
    x: tip.x - Math.cos(direction) * headLength,
    y: tip.y - Math.sin(direction) * headLength,
  })) as [Point, Point];
  return { tip, corners };
}

function frameAt(start: Point, control: Point, end: Point, t: number) {
  const remaining = 1 - t;
  const point = {
    x: remaining * remaining * start.x + 2 * remaining * t * control.x + t * t * end.x,
    y: remaining * remaining * start.y + 2 * remaining * t * control.y + t * t * end.y,
  };
  const tangent = {
    x: 2 * remaining * (control.x - start.x) + 2 * t * (end.x - control.x),
    y: 2 * remaining * (control.y - start.y) + 2 * t * (end.y - control.y),
  };
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  return { point, normal: { x: -tangent.y / length, y: tangent.x / length } };
}

function approximateLength(start: Point, control: Point, end: Point): number {
  let length = 0;
  let previous = start;
  for (let index = 1; index <= 24; index++) {
    const next = frameAt(start, control, end, index / 24).point;
    length += distance(previous, next);
    previous = next;
  }
  return length;
}

function offset(point: Point, normal: Point, amount: number): Point {
  return { x: point.x + normal.x * amount, y: point.y + normal.y * amount };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
