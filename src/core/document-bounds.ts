import type { DrawingObject, Rect } from './model';
import { objectBounds } from './geometry';
import { measureText } from './label-layout';

// Gestures and history replace edited objects rather than mutating them. Reuse
// unchanged extents so dragging one image never remeasures every label/pen path.
const visualExtents = new WeakMap<DrawingObject, Rect>();

/** The screenshot stays anchored at (0, 0); content can extend on every side. */
export function documentBounds(
  width: number,
  height: number,
  objects: readonly DrawingObject[],
): Rect {
  let left = 0;
  let top = 0;
  let right = width;
  let bottom = height;
  for (const object of objects) {
    const rect = visualExtent(object);
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  left = Math.floor(left);
  top = Math.floor(top);
  return { x: left, y: top, width: Math.ceil(right) - left, height: Math.ceil(bottom) - top };
}

function visualExtent(object: DrawingObject): Rect {
  const cached = visualExtents.get(object);
  if (cached) return cached;
  // Omit scene bounds here: labels are free content until the user explicitly crops.
  const rect = objectBounds(object);
  let padding = 0;
  let shadowOffset = 0;
  if (object.type === 'arrow' && object.style.shadow !== false) {
    padding = 10;
    shadowOffset = 2;
  } else if (object.type === 'sticky' && object.style.shadow !== false) {
    padding = 28;
    shadowOffset = 5;
  } else if (object.type === 'magnifier') {
    // objectBounds contains the colored ring, but not the outer white ring.
    padding = 2 + Math.max(0, 2 - object.style.width) / 2;
  } else if (object.type === 'step') {
    padding = Math.max(0, 3 - object.style.width) / 2;
  } else if (object.type === 'text') {
    padding = Math.max(3, object.fontSize / 7) / 2;
    rect.width = Math.max(
      rect.width,
      ...object.text.split('\n').map((line) => measureText(line, object.fontSize)),
    );
  }
  const extent = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2 + shadowOffset,
  };
  visualExtents.set(object, extent);
  return extent;
}
