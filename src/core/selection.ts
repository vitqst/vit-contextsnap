import type { DrawingObject, EditorDocument } from './model';

export function selectObject(
  selected: readonly string[],
  id: string | null,
  toggle = false,
): readonly string[] {
  if (id === null) return selected.length ? [] : selected;
  if (!toggle) return selected.length === 1 && selected[0] === id ? selected : [id];
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function retainSelection(
  selected: readonly string[],
  objects: readonly DrawingObject[],
): readonly string[] {
  if (!selected.length) return selected;
  const available = new Set(objects.map((object) => object.id));
  const retained = selected.filter((id) => available.has(id));
  return retained.length === selected.length ? selected : retained;
}

export function deleteSelection(doc: EditorDocument, selected: readonly string[]): EditorDocument {
  if (!selected.length) return doc;
  const ids = new Set(selected);
  const objects = doc.objects.filter((object) => !ids.has(object.id));
  return objects.length === doc.objects.length ? doc : { ...doc, objects };
}
