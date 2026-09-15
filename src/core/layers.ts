import type { DrawingObject } from './model';

/** Paint and hit testing share this ordering so the visible topmost object is selected. */
export function objectsInPaintOrder(objects: readonly DrawingObject[]): DrawingObject[] {
  return [...objects].sort((a, b) => paintLayer(a) - paintLayer(b));
}

function paintLayer(object: DrawingObject): number {
  if (object.type === 'blur') return 0;
  if (object.type === 'magnifier') return 1;
  if (object.type === 'redact') return 3;
  return 2;
}
