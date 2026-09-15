import type { DrawingObject } from './model';

export type LayerDirection = 'forward' | 'backward';

/** Paint and hit testing share this ordering so the visible topmost object is selected. */
export function objectsInPaintOrder(objects: readonly DrawingObject[]): DrawingObject[] {
  return [...objects].sort((a, b) => paintLayer(a) - paintLayer(b));
}

export function canReorderObject(
  objects: readonly DrawingObject[],
  id: string,
  direction: LayerDirection,
): boolean {
  return reorderIndices(objects, id, direction) !== null;
}

export function reorderObject(
  objects: DrawingObject[],
  id: string,
  direction: LayerDirection,
): DrawingObject[];
export function reorderObject(
  objects: readonly DrawingObject[],
  id: string,
  direction: LayerDirection,
): readonly DrawingObject[];
/** Swap adjacent members of the same paint family; never move an image above privacy effects. */
export function reorderObject(
  objects: readonly DrawingObject[],
  id: string,
  direction: LayerDirection,
): readonly DrawingObject[] {
  const indices = reorderIndices(objects, id, direction);
  if (!indices) return objects;
  const [index, peerIndex] = indices;
  const object = objects[index];
  const peer = objects[peerIndex];
  if (!object || !peer) return objects;
  const reordered = [...objects];
  reordered[index] = peer;
  reordered[peerIndex] = object;
  return reordered;
}

function reorderIndices(
  objects: readonly DrawingObject[],
  id: string,
  direction: LayerDirection,
): [number, number] | null {
  const index = objects.findIndex((object) => object.id === id);
  const object = objects[index];
  if (!object) return null;
  const layer = paintLayer(object);
  const step = direction === 'forward' ? 1 : -1;
  for (
    let peerIndex = index + step;
    peerIndex >= 0 && peerIndex < objects.length;
    peerIndex += step
  ) {
    const peer = objects[peerIndex];
    if (peer && paintLayer(peer) === layer) return [index, peerIndex];
  }
  return null;
}

function paintLayer(object: DrawingObject): number {
  if (object.type === 'image') return 0;
  if (object.type === 'blur') return 1;
  if (object.type === 'magnifier') return 2;
  if (object.type === 'redact') return 4;
  return 3;
}
