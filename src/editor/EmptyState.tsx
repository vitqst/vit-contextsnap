import { ImagePlus, LockKeyhole } from 'lucide-react';

interface Props {
  loading: boolean;
  onOpenImage: () => void;
}

export function EmptyState({ loading, onOpenImage }: Props) {
  return (
    <main className="empty-workspace">
      <div className="empty-illustration">
        <div className="empty-picture">
          <ImagePlus size={40} strokeWidth={1.3} />
        </div>
        <svg viewBox="0 0 120 100" className="empty-arrow" aria-hidden="true">
          <path
            d="M 10 12 Q 100 5 80 80 M 63 63 L 80 81 L 99 68"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="eyebrow">CAPTURE. MARK UP. SHARE.</span>
      <h1>
        Make your point.
        <br />
        <span>With a picture.</span>
      </h1>
      <p>
        Drop in a screenshot, add a few arrows,
        <br />
        and give your ideas a little more context.
      </p>
      <button className="button primary open-image-button" onClick={onOpenImage} disabled={loading}>
        <ImagePlus size={17} />
        {loading ? 'Opening…' : 'Open image'}
      </button>
      <span className="empty-hint">or drop an image here · PNG, JPEG, WebP</span>
      <div className="empty-local">
        <LockKeyhole size={13} />
        Your screenshots stay on your device.
      </div>
    </main>
  );
}
