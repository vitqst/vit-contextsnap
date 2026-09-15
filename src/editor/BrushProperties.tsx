import { useId } from 'react';
import { normalizeBrush } from '../core/brush';
import type { BrushSettings } from '../core/model';

const SETTINGS: { key: keyof BrushSettings; label: string }[] = [
  { key: 'smoothing', label: 'Smoothing' },
  { key: 'pressure', label: 'Pressure influence' },
  { key: 'speed', label: 'Speed influence' },
];

export function BrushProperties({
  value,
  onChange,
}: {
  value: BrushSettings;
  onChange: (value: BrushSettings) => void;
}) {
  const id = useId();
  const brush = normalizeBrush(value);
  return (
    <>
      {SETTINGS.map(({ key, label }) => (
        <div key={key}>
          <label className="property-label" htmlFor={`${id}-${key}`}>
            {label} <span aria-hidden="true">{Math.round(brush[key] * 100)}%</span>
          </label>
          <input
            id={`${id}-${key}`}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={brush[key]}
            onChange={(event) =>
              onChange(normalizeBrush({ ...brush, [key]: Number(event.target.value) }))
            }
          />
        </div>
      ))}
      <p className="property-note">
        Pen pressure controls width when available. Mouse strokes get thinner as you draw faster.
        Set both influences to zero for constant width.
      </p>
    </>
  );
}
