import { describe, expect, it } from 'vitest';
import { commitHistory, initialHistory, redoHistory, undoHistory } from './history';

describe('document history', () => {
  it('undoes and redoes complete immutable states', () => {
    const initial = initialHistory<{ objects: string[]; crop: { x: number } | null }>({
      objects: [],
      crop: null,
    });
    const edited = commitHistory(initial, { objects: [], crop: { x: 1 } });
    expect(edited.past).toEqual([initial.present]);
    const undone = undoHistory(edited);
    expect(undone.present).toEqual(initial.present);
    expect(redoHistory(undone).present).toEqual(edited.present);
    expect(initial.past).toEqual([]);
    expect(edited.future).toEqual([]);
  });

  it('discards the redo branch when an undone document is edited', () => {
    const history = commitHistory(commitHistory(initialHistory(0), 1), 2);
    const branched = commitHistory(undoHistory(history), 3);
    expect(branched.present).toBe(3);
    expect(branched.future).toEqual([]);
    expect(redoHistory(branched)).toBe(branched);
  });

  it('keeps 100 undo steps by default and no-ops at either boundary', () => {
    let history = initialHistory(0);
    expect(undoHistory(history)).toBe(history);
    expect(commitHistory(history, 0)).toBe(history);
    for (let i = 1; i <= 130; i++) history = commitHistory(history, i);
    expect(history.past).toHaveLength(100);
    for (let i = 0; i < 100; i++) history = undoHistory(history);
    expect(history.present).toBe(30);
    expect(undoHistory(history)).toBe(history);
    for (let i = 0; i < 100; i++) history = redoHistory(history);
    expect(history.present).toBe(130);
    expect(redoHistory(history)).toBe(history);
  });

  it('never reduces the undo capacity below 50', () => {
    let history = initialHistory(0);
    for (let i = 1; i <= 60; i++) history = commitHistory(history, i, 2);
    expect(history.past).toHaveLength(50);
  });
});
