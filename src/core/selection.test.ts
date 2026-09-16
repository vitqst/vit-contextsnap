import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type DrawingObject, type EditorDocument } from './model';
import { commitHistory, initialHistory, redoHistory, undoHistory } from './history';
import { deleteSelection, retainSelection, selectObject } from './selection';

const objects: DrawingObject[] = ['a', 'b', 'c'].map((id, index) => ({
  id,
  seed: index,
  type: 'step',
  style: DEFAULT_STYLE,
  center: { x: index * 100, y: 100 },
  radius: 22,
  number: index + 1,
}));
const doc: EditorDocument = { version: 1, objects, crop: null };

describe('multi-selection', () => {
  it('replaces ordinary selection and toggles individual ids for Shift-click', () => {
    expect(selectObject(['a'], 'b')).toEqual(['b']);
    expect(selectObject(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(selectObject(['a', 'b'], 'a', true)).toEqual(['b']);
    expect(selectObject(['a', 'b'], null)).toEqual([]);
    expect(selectObject(['a', 'b'], null, true)).toEqual([]);
  });

  it('drops missing ids after document changes without allocating when selection is unchanged', () => {
    const selected = ['a', 'b'];
    expect(retainSelection(selected, objects)).toBe(selected);
    expect(retainSelection(selected, [objects[1]!])).toEqual(['b']);
    expect(retainSelection(selected, [])).toEqual([]);
  });

  it('deletes the entire group in one immutable, undoable document change', () => {
    const next = deleteSelection(doc, ['a', 'c']);
    expect(next.objects).toEqual([objects[1]]);
    expect(doc.objects).toHaveLength(3);
    expect(next.objects[0]).toBe(objects[1]);
    const history = commitHistory(initialHistory(doc), next);
    expect(undoHistory(history).present).toBe(doc);
    expect(redoHistory(undoHistory(history)).present).toBe(next);
    expect(deleteSelection(doc, [])).toBe(doc);
    expect(deleteSelection(doc, ['missing'])).toBe(doc);
  });
});
