import { Aperture } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Aperture size={21} strokeWidth={2} />
      </span>
      {!compact && (
        <span>
          Context<span className="brand-light">Snap</span>
        </span>
      )}
    </div>
  );
}
