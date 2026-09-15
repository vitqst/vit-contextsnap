import { arrowControl, arrowMode } from './arrows';
import { getArrowLabelLayout } from './arrow-label';
import type { ArrowHandle, ArrowObject, Point, Rect } from './model';

export function arrowHandles(
  arrow: ArrowObject,
  sceneBounds: Rect,
  scale: number,
): [ArrowHandle, Point][] {
  const control = arrowControl(arrow);
  const middle = {
    x: (arrow.start.x + 2 * control.x + arrow.end.x) / 4,
    y: (arrow.start.y + 2 * control.y + arrow.end.y) / 4,
  };
  const handles: [ArrowHandle, Point][] = [
    ['start', arrow.start],
    ['end', arrow.end],
  ];
  if (arrowMode(arrow) === 'curved') {
    const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const radius = 7 / zoom;
    const inside = (point: Point): Point => clampHandle(point, sceneBounds, radius);
    let position = inside(middle);
    if (arrow.label.trim()) {
      const { rect } = getArrowLabelLayout(arrow, sceneBounds);
      const gap = 18 / zoom;
      const candidates = [
        position,
        { x: middle.x, y: rect.y - gap },
        { x: middle.x, y: rect.y + rect.height + gap },
        { x: rect.x - gap, y: middle.y },
        { x: rect.x + rect.width + gap, y: middle.y },
      ].map(inside);
      // Clamping an above-label handle can put it inside the label; try another side first.
      position =
        candidates.find(
          (point) =>
            point.x + radius < rect.x ||
            point.x - radius > rect.x + rect.width ||
            point.y + radius < rect.y ||
            point.y - radius > rect.y + rect.height,
        ) ?? position;
    }
    handles.push(['control', position]);
  }
  return handles;
}

function clampHandle(point: Point, bounds: Rect, radius: number): Point {
  const insetX = Math.min(radius, Math.max(0, bounds.width) / 2);
  const insetY = Math.min(radius, Math.max(0, bounds.height) / 2);
  return {
    x: Math.max(bounds.x + insetX, Math.min(bounds.x + bounds.width - insetX, point.x)),
    y: Math.max(bounds.y + insetY, Math.min(bounds.y + bounds.height - insetY, point.y)),
  };
}
