import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Clock3,
  Crop,
  ImagePlus,
  Keyboard,
  LockKeyhole,
  Monitor,
  Trash2,
} from 'lucide-react';
import { clearRecent, deleteRecent, listRecent } from '../platform/storage';
import type { CaptureReply, RecentRecord } from '../platform/types';
import { Brand } from '../ui/Brand';
import { IconButton } from '../ui/IconButton';

function RecentThumbnail({ item }: { item: RecentRecord }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(item.image);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [item.image]);
  return <img src={src || undefined} alt="" />;
}

export function Popup() {
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);
  const [tabId, setTabId] = useState<number>();
  const [clearPending, setClearPending] = useState(false);
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  useEffect(() => {
    void listRecent()
      .then(setRecent)
      .catch(() => setError('Recent images could not be loaded.'));
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        setTabId(tab?.id);
        if (
          !tab?.url ||
          !/^https?:\/\//.test(tab.url) ||
          /https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/.test(tab.url)
        ) {
          setBlocked(
            'Open a regular website to capture it. Chrome settings, the Web Store, and extension pages are not supported.',
          );
        }
      })
      .catch(() => setBlocked('This tab is unavailable. Open a website and try again.'));
    void chrome.storage.session.get('lastCaptureError').then(({ lastCaptureError }) => {
      if (typeof lastCaptureError === 'string') setError(lastCaptureError);
      void chrome.storage.session.remove(['lastCaptureError', 'lastCaptureErrorAt']);
    });
    void chrome.action.setBadgeText({ text: '' });
    void chrome.commands
      .getAll()
      .then((commands) => {
        setShortcuts(
          Object.fromEntries(
            commands.map((command) => [command.name ?? '', command.shortcut ?? '']),
          ),
        );
      })
      .catch(() => {
        /* Capture buttons remain usable without shortcut hints. */
      });
  }, []);

  function shortcutLabel(command: string) {
    const shortcut = shortcuts[command] ?? '';
    return shortcut
      .replace('Alt', navigator.platform.includes('Mac') ? '⌥' : 'Alt')
      .replace('Shift', '⇧')
      .replaceAll('+', ' ');
  }

  async function capture(mode: 'visible' | 'area') {
    setBusy(true);
    setError('');
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'capture',
        mode,
        tabId,
      })) as CaptureReply;
      if (!response?.ok) throw new Error(response?.error || 'Capture failed. Try again.');
      window.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed. Try again.');
      setBusy(false);
    }
  }

  async function openEditor(recentId?: string) {
    await chrome.tabs.create({
      url: chrome.runtime.getURL(
        `editor.html${recentId ? `?recent=${encodeURIComponent(recentId)}` : ''}`,
      ),
    });
    window.close();
  }

  async function removeRecent(id: string) {
    try {
      await deleteRecent(id);
      setRecent((items) => items.filter((item) => item.id !== id));
    } catch {
      setError('This recent image could not be removed.');
    }
  }

  async function removeAllRecent() {
    try {
      await clearRecent();
      setRecent([]);
      setClearPending(false);
    } catch {
      setError('Recent images could not be cleared.');
    }
  }

  return (
    <div className="popup">
      <header className="popup-header">
        <Brand />
        <span className="version-badge">v{chrome.runtime.getManifest().version}</span>
      </header>
      <main>
        <div className="popup-intro">
          <h1>A clearer way to point.</h1>
          <p>Capture a detail. Give it context.</p>
        </div>
        {blocked && (
          <p className="blocked-note" role="status">
            {blocked}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div className="capture-actions">
          <button
            className="capture-card selected-area"
            disabled={busy || !!blocked}
            onClick={() => void capture('area')}
            aria-label="Capture area"
          >
            <span className="capture-icon">
              <Crop size={21} strokeWidth={1.7} />
            </span>
            <span className="capture-label">
              <strong>Select an area</strong>
              <span>Just the part that matters</span>
            </span>
            <span className="capture-shortcut">{shortcutLabel('capture-area')}</span>
          </button>
          <button
            className="capture-card"
            disabled={busy || !!blocked}
            onClick={() => void capture('visible')}
            aria-label="Capture visible page"
          >
            <span className="capture-icon">
              <Monitor size={21} strokeWidth={1.7} />
            </span>
            <span className="capture-label">
              <strong>Visible page</strong>
              <span>Everything in your viewport</span>
            </span>
            <span className="capture-shortcut">{shortcutLabel('capture-visible')}</span>
          </button>
        </div>
        <button className="open-editor" onClick={() => void openEditor()}>
          <ImagePlus size={15} />
          <span>Open an image instead</span>
          <ArrowUpRight size={14} />
        </button>
        <section className="recent-section" aria-label="Recent exports">
          <div className="recent-heading">
            <span>RECENT EXPORTS</span>
            {recent.length > 0 && (
              <button onClick={() => setClearPending(!clearPending)}>
                {clearPending ? 'Cancel' : 'Clear all'}
              </button>
            )}
          </div>
          {clearPending && (
            <div className="clear-confirm">
              <span>Remove all saved exports?</span>
              <button onClick={() => void removeAllRecent()}>Remove all</button>
            </div>
          )}
          {recent.length === 0 ? (
            <div className="recent-empty">
              <Clock3 size={17} />
              <span>
                Your copied and downloaded images
                <br />
                will be right here.
              </span>
            </div>
          ) : (
            <div className="recent-list">
              {recent.slice(0, 5).map((item) => (
                <div className="recent-row" key={item.id}>
                  <button
                    className="recent-item"
                    onClick={() => void openEditor(item.id)}
                    aria-label={`Open recent ${item.title}`}
                  >
                    <RecentThumbnail item={item} />
                    <span>
                      <strong>{item.title || 'Screenshot'}</strong>
                      <small>
                        {item.width} × {item.height} ·{' '}
                        {new Date(item.exportedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </small>
                    </span>
                  </button>
                  <IconButton
                    label={`Remove ${item.title}`}
                    onClick={() => void removeRecent(item.id)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="popup-footer">
        <span>
          <LockKeyhole size={11} />
          Always local.
          <Check size={10} />
        </span>
        <button
          aria-label="Configure keyboard shortcuts"
          title="Configure keyboard shortcuts"
          onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
        >
          <Keyboard size={15} />
          Shortcuts
        </button>
      </footer>
    </div>
  );
}
