import type { Rect } from '../core/model';

interface Props {
  objectCount: number;
  crop: Rect | null;
  onResetCrop: () => void;
}

export function EditorFooter({ objectCount, crop, onResetCrop }: Props) {
  return (
    <footer className="editor-footer">
      <span>
        <span className="local-dot" />
        Local by design. Yours to share.
      </span>
      <span data-testid="object-count">
        {objectCount} {objectCount === 1 ? 'object' : 'objects'}
        {crop && (
          <>
            {' '}
            · Cropped to {crop.width} × {crop.height}
            <button className="reset-crop" onClick={onResetCrop}>
              Reset crop
            </button>
          </>
        )}
      </span>
      <span>Made for a clearer point.</span>
    </footer>
  );
}
