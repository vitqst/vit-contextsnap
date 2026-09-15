import { useCallback, useRef, useState } from 'react';
import { EMPTY_DOCUMENT, type EditorDocument } from '../core/model';
import { commitHistory, initialHistory, redoHistory, undoHistory } from '../core/history';

export function useDocument() {
  const [history, setHistory] = useState(() => initialHistory<EditorDocument>(EMPTY_DOCUMENT));
  const liveHistory = useRef(history);
  const [preview, setPreview] = useState<EditorDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const commit = useCallback((doc: EditorDocument) => {
    setPreview(null);
    liveHistory.current = commitHistory(liveHistory.current, doc);
    setHistory(liveHistory.current);
  }, []);
  const undo = useCallback(() => {
    setPreview(null);
    liveHistory.current = undoHistory(liveHistory.current);
    setHistory(liveHistory.current);
  }, []);
  const redo = useCallback(() => {
    setPreview(null);
    liveHistory.current = redoHistory(liveHistory.current);
    setHistory(liveHistory.current);
  }, []);
  const reset = useCallback(() => {
    liveHistory.current = initialHistory<EditorDocument>({ version: 1, objects: [], crop: null });
    setHistory(liveHistory.current);
    setPreview(null);
    setSelectedId(null);
  }, []);
  const getCurrent = useCallback(() => liveHistory.current.present, []);
  return {
    doc: preview ?? history.present,
    committed: history.present,
    preview: setPreview,
    commit,
    selectedId,
    select: setSelectedId,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    getCurrent,
  };
}
