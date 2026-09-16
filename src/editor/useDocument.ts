import { useCallback, useRef, useState } from 'react';
import { EMPTY_DOCUMENT, type EditorDocument } from '../core/model';
import { commitHistory, initialHistory, redoHistory, undoHistory } from '../core/history';
import { retainSelection, selectObject } from '../core/selection';

export function useDocument(validate?: (doc: EditorDocument) => boolean) {
  const validator = useRef(validate);
  validator.current = validate;
  const [history, setHistory] = useState(() => initialHistory<EditorDocument>(EMPTY_DOCUMENT));
  const liveHistory = useRef(history);
  const [preview, setPreview] = useState<EditorDocument | null>(null);
  const livePreview = useRef<EditorDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const select = useCallback((id: string | null, toggle = false) => {
    setSelectedIds((current) => selectObject(current, id, toggle));
  }, []);
  const selectAll = useCallback(() => {
    // Selection is not a document edit. Read the live committed scene so an
    // immediately preceding edit/undo is included without selecting draft objects.
    setSelectedIds(liveHistory.current.present.objects.map((object) => object.id));
  }, []);
  const commit = useCallback((doc: EditorDocument) => {
    livePreview.current = null;
    setPreview(null);
    if (validator.current && !validator.current(doc)) return;
    liveHistory.current = commitHistory(liveHistory.current, doc);
    setHistory(liveHistory.current);
    setSelectedIds((current) => retainSelection(current, doc.objects));
  }, []);
  const undo = useCallback(() => {
    livePreview.current = null;
    setPreview(null);
    liveHistory.current = undoHistory(liveHistory.current);
    setHistory(liveHistory.current);
    const objects = liveHistory.current.present.objects;
    setSelectedIds((current) => retainSelection(current, objects));
  }, []);
  const redo = useCallback(() => {
    livePreview.current = null;
    setPreview(null);
    liveHistory.current = redoHistory(liveHistory.current);
    setHistory(liveHistory.current);
    const objects = liveHistory.current.present.objects;
    setSelectedIds((current) => retainSelection(current, objects));
  }, []);
  const reset = useCallback(() => {
    livePreview.current = null;
    liveHistory.current = initialHistory<EditorDocument>({ version: 1, objects: [], crop: null });
    setHistory(liveHistory.current);
    setPreview(null);
    setSelectedIds([]);
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
    selectedIds,
    selectedId: selectedIds.length === 1 ? selectedIds[0]! : null,
    select,
    selectAll,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
    getCurrent,
    getPreview,
  };
}
