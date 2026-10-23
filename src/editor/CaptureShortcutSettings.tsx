import { useEffect, useRef, useState } from 'react';
import type { CaptureShortcuts, EditorPlatform } from '../platform/editor-platform';

export function CaptureShortcutSettings({
  platform,
  onClose,
}: {
  platform: EditorPlatform;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<CaptureShortcuts | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let disposed = false;
    void platform.getCaptureShortcuts!()
      .then((value) => {
        if (disposed) return;
        setSettings(value);
        setError(value.error ?? '');
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(String(cause));
      });
    return () => {
      disposed = true;
    };
  }, [platform]);
  return (
    <dialog
      ref={dialog}
      className="capture-shortcut-dialog"
      aria-labelledby="capture-shortcut-title"
      onCancel={onClose}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!settings || saving) return;
          setSaving(true);
          setError('');
          try {
            await platform.setCaptureShortcuts!({
              screenshot: settings.screenshot.trim(),
              copy: settings.copy.trim(),
            });
            onClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setSaving(false);
          }
        }}
      >
        <h2 id="capture-shortcut-title">Screenshot shortcuts</h2>
        <p>Global shortcuts work while ContextSnap is running, including from the tray.</p>
        <p>
          Use keys such as Ctrl+Shift+4 or Super+Shift+4 (Command on macOS). Leave a field empty to
          disable it.
        </p>
        {settings && (
          <>
            <label>
              Screenshot
              <input
                autoFocus
                value={settings.screenshot}
                disabled={saving}
                onChange={(event) => setSettings({ ...settings, screenshot: event.target.value })}
              />
            </label>
            <label>
              Screenshot &amp; Copy
              <input
                value={settings.copy}
                disabled={saving}
                onChange={(event) => setSettings({ ...settings, copy: event.target.value })}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="capture-shortcut-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!settings || saving}>
            {saving ? 'Saving…' : 'Save shortcuts'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
