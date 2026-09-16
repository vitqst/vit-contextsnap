import { useCallback, useRef, useState } from 'react';
import { EMPTY_DOCUMENT, type EditorDocument } from '../core/model';
import { commitHistory, initialHistory, redoHistory, undoHistory } from '../core/history';

export function useDocument(validate?: (doc: EditorDocument) => boolean) {
  const validator = useRef(validate);
  validator.current = validate;
  const [history, setHistory] = useState(() => initialHistory<EditorDocument>(EMPTY_DOCUMENT));
  const liveHistory = useRef(history);
  const [preview, setPreview] = useState<EditorDocument | null>(null);
  const livePreview = useRef<EditorDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const commit = useCallback((doc: EditorDocument) => {
    livePreview.current = null;
    setPreview(null);
    if (validator.current && !validator.current(doc)) return;
    liveHistory.current = commitHistory(liveHistory.current, doc);
    setHistory(liveHistory.current);
  }, []);
  const undo = useCallback(() => {
    livePreview.current = null;
    setPreview(null);
    liveHistory.current = undoHistory(liveHistory.current);
    setHistory(liveHistory.current);
  }, []);
  const redo = useCallback(() => {
    livePreview.current = null;
    setPreview(null);
    liveHistory.current = redoHistory(liveHistory.current);
    setHistory(liveHistory.current);
  }, []);
  const reset = useCallback(() => {
    livePreview.current = null;
    liveHistory.current = initialHistory<EditorDocument>({ version: 1, objects: [], crop: null });
    setHistory(liveHistory.current);
    setPreview(null);
    setSelectedId(null);
  }, []);
  const getCurrent = useCallback(() => liveHistory.current.present, []);
  const getPreview = useCallback(() => livePreview.current ?? liveHistory.current.present, []);
  const previewDocument = useCallback((doc: EditorDocument | null) => {
    if (!doc || !validator.current || validator.current(doc)) {
      // A canvas frame must not wait for React's continuous-event state commit.
      // Publish only validated drafts; rejected moves retain the last safe frame.
      livePreview.current = doc;
      setPreview(doc);
    }
  }, []);
  return {
    doc: preview ?? history.present,
    committed: history.present,
    preview: previewDocument,
    commit,
    selectedId,
    select: setSelectedId,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    getCurrent,
    getPreview,
  };
}
