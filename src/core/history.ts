export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** History stores immutable snapshots; a complete pointer gesture should commit once. */
export function initialHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function commitHistory<T>(history: History<T>, present: T, limit = 100): History<T> {
  if (Object.is(history.present, present)) return history;
  const capacity = Number.isFinite(limit) ? Math.max(50, Math.floor(limit)) : 100;
  return {
    past: [...history.past, history.present].slice(-capacity),
    present,
    future: [],
  };
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1] as T,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0] as T,
    future: history.future.slice(1),
  };
}
