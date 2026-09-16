import { ArrowLeft, Camera, Copy, Download, FolderOpen, ImagePlus } from 'lucide-react';
import { Brand } from '../ui/Brand';
import { IconButton } from '../ui/IconButton';

interface Props {
  captureTitle: string | null;
  hasImage: boolean;
  busy: boolean;
  canReturn: boolean;
  returning: boolean;
  onReturn: () => void;
  onAddImage: () => void;
  onOpenImage: () => void;
  onDownloadImage: () => void;
  onCopyImage: () => void;
  saveLabel: string;
  onCapture?: () => void;
}

export function EditorHeader({
  captureTitle,
  hasImage,
  busy,
  canReturn,
  returning,
  onReturn,
  onAddImage,
  onOpenImage,
  onDownloadImage,
  onCopyImage,
  saveLabel,
  onCapture,
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
        {onCapture && (
          <button
            className="button"
            aria-label="Capture screenshot"
            title="Capture screenshot (⌘ / Ctrl Shift S)"
            disabled={busy}
            onClick={onCapture}
          >
            <Camera size={16} />
            <span>Capture</span>
          </button>
        )}
        {canReturn && (
          <button
            className="button source-button"
            aria-label="Back to website"
            title="Back to website — your editor stays open"
            disabled={returning || busy}
            onClick={onReturn}
          >
            <ArrowLeft size={16} />
            <span>Back to website</span>
          </button>
        )}
        <IconButton label="Open another image" disabled={busy} onClick={onOpenImage}>
          <FolderOpen size={18} />
        </IconButton>
        {hasImage && (
          <>
            <button
              className="button add-image-button"
              aria-label="Add image"
              title="Add image"
              disabled={busy}
              onClick={onAddImage}
            >
              <ImagePlus size={16} />
              <span>Add image</span>
            </button>
            <span className="divider" />
            <IconButton label={saveLabel} disabled={busy} onClick={onDownloadImage}>
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
