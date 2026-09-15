import type { ArrowObject, Point, Rect } from './model';
import { getTextLabelLayout, labelFontSize } from './label-layout';

export { LABEL_FONT_FAMILY as ARROW_LABEL_FONT_FAMILY } from './label-layout';
export type { LabelLayout as ArrowLabelLayout } from './label-layout';

export function arrowLabelFontSize(arrow: ArrowObject): number {
  return labelFontSize(arrow.labelFontSize);
}

export function getArrowLabelLayout(arrow: ArrowObject, bounds?: Rect) {
  return getTextLabelLayout(
    arrow.label,
    arrow.labelFontSize,
    ({ height }) => ({
      x: arrow.start.x + (arrow.labelOffset?.x ?? 0),
      y: arrow.start.y - 8 - height / 2 + (arrow.labelOffset?.y ?? 0),
    }),
    bounds,
  );
}

export function hitTestArrowLabel(arrow: ArrowObject, point: Point, bounds?: Rect): boolean {
  if (!arrow.label.trim()) return false;
  const { rect, lines } = getArrowLabelLayout(arrow, bounds);
  return (
    lines.length > 0 &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Offset from the tail, measured from the visible layout so crop-clamped drags never jump. */
export function moveArrowLabelBy(arrow: ArrowObject, delta: Point, bounds?: Rect): ArrowObject {
  if (!delta.x && !delta.y) return arrow;
  const before = getArrowLabelLayout(arrow, bounds);
  return {
    ...arrow,
    labelOffset: {
      x: before.center.x + delta.x - arrow.start.x,
      y: before.center.y + delta.y - arrow.start.y + 8 + before.rect.height / 2,
    },
  };
}
