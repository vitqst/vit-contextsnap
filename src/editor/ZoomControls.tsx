import { ChevronDown, Expand, Minus, Plus } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { MAX_ZOOM, MIN_ZOOM } from './viewport';

interface Props {
  scale: number;
  onChange: (scale: number | null) => void;
}

export function ZoomControls({ scale, onChange }: Props) {
  return (
    <div className="zoom-controls">
      <IconButton
        label="Zoom out"
        disabled={scale <= MIN_ZOOM}
        onClick={() => onChange(Math.max(MIN_ZOOM, scale / 1.2))}
      >
        <Minus size={15} />
      </IconButton>
      <button className="zoom-value" onClick={() => onChange(null)} title="Fit to screen">
        {Math.round(scale * 100)}%<ChevronDown size={11} />
      </button>
      <IconButton
        label="Zoom in"
        disabled={scale >= MAX_ZOOM}
        onClick={() => onChange(Math.min(MAX_ZOOM, scale * 1.2))}
      >
        <Plus size={15} />
      </IconButton>
      <span className="divider" />
      <button
        type="button"
        className="zoom-value"
        aria-label="Actual pixels"
        title="Actual pixels — one image pixel per screen pixel"
        onClick={() => {
          const ratio = window.devicePixelRatio;
          onChange(Number.isFinite(ratio) && ratio > 0 ? 1 / ratio : 1);
        }}
      >
        1:1
      </button>
      <IconButton label="Fit to screen" onClick={() => onChange(null)}>
        <Expand size={15} />
      </IconButton>
    </div>
  );
}
