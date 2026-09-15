import type { DrawingObject } from '../core/model';

interface RangeProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function RangeProperty({ label, value, display, min, max, step = 1, onChange }: RangeProps) {
  const id = `property-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <>
      <label className="property-label" htmlFor={id}>
        {label} <span aria-hidden="true">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </>
  );
}

export function EffectsProperties({
  selected,
  onUpdate,
}: {
  selected: DrawingObject;
  onUpdate: (object: DrawingObject) => void;
}) {
  if (selected.type === 'step')
    return (
      <>
        <label className="property-label" htmlFor="step-number">
          Step number
        </label>
        <input
          id="step-number"
          type="number"
          min={1}
          max={9999}
          value={selected.number}
          onChange={(event) => {
            const number = Number(event.target.value);
            if (Number.isInteger(number) && number >= 1 && number <= 9999)
              onUpdate({ ...selected, number });
          }}
        />
        <RangeProperty
          label="Step size"
          value={selected.radius}
          display={`${selected.radius * 2} px`}
          min={16}
          max={48}
          onChange={(radius) => onUpdate({ ...selected, radius })}
        />
      </>
    );
  if (selected.type === 'blur')
    return (
      <RangeProperty
        label="Blur strength"
        value={selected.strength}
        display={`${selected.strength} px`}
        min={4}
        max={32}
        onChange={(strength) => onUpdate({ ...selected, strength })}
      />
    );
  if (selected.type === 'magnifier')
    return (
      <>
        <RangeProperty
          label="Magnification"
          value={selected.zoom}
          display={`${selected.zoom}×`}
          min={1.5}
          max={4}
          step={0.5}
          onChange={(zoom) => onUpdate({ ...selected, zoom })}
        />
        <RangeProperty
          label="Lens size"
          value={selected.radius}
          display={`${Math.round(selected.radius * 2)} px`}
          min={32}
          max={180}
          onChange={(radius) => onUpdate({ ...selected, radius })}
        />
      </>
    );
  return null;
}
