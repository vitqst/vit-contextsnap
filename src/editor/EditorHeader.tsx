import { Copy, Download, FolderOpen } from 'lucide-react';
import { Brand } from '../ui/Brand';
import { IconButton } from '../ui/IconButton';

interface Props {
  captureTitle: string | null;
  hasImage: boolean;
  busy: boolean;
  onOpenImage: () => void;
  onDownloadImage: () => void;
  onCopyImage: () => void;
}

export function EditorHeader({
  captureTitle,
  hasImage,
  busy,
  onOpenImage,
  onDownloadImage,
  onCopyImage,
}: Props) {
  return (
    <header className="editor-header">
      <div className="header-start">
        <Brand />
        <span className="header-tag">EDITOR</span>
      </div>
      <div className="document-name">
        {captureTitle !== null ? (
          <>
            <span className="document-dot" />
            {captureTitle || 'Untitled capture'}
          </>
        ) : (
          'A little context goes a long way.'
        )}
      </div>
      <div className="header-actions">
        <IconButton label="Open another image" onClick={onOpenImage}>
          <FolderOpen size={18} />
        </IconButton>
        {hasImage && (
          <>
            <span className="divider" />
            <IconButton label="Download PNG" disabled={busy} onClick={onDownloadImage}>
              <Download size={18} />
            </IconButton>
            <button className="button primary copy-button" disabled={busy} onClick={onCopyImage}>
              <Copy size={15} />
              {busy ? 'Preparing…' : 'Copy image'}
              <kbd>⌘ / Ctrl C</kbd>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
