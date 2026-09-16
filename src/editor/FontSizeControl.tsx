import { useEffect, useId, useRef } from 'react';
import './font-size-control.css';

interface Props {
  label: string;
  value: number;
  effectiveValue?: number;
  min: number;
  max: number;
  presets: readonly number[];
  auto?: boolean;
  onAuto?: () => void;
  onChange: (value: number) => void;
  onPreview?: (value: number) => void;
  onCancelPreview?: () => void;
}

/** Pointer drags preview continuously, then make one undoable change on release. */
export function FontSizeControl({
  label,
  value,
  effectiveValue = value,
  min,
  max,
  presets,
  auto,
  onAuto,
  onChange,
  onPreview,
  onCancelPreview,
}: Props) {
  const id = useId();
  const gesture = useRef<{
    value: number;
    startValue: number;
    max: number;
    changed: boolean;
    cancelled: boolean;
  } | null>(null);
  const callbacks = useRef({ onChange, onCancelPreview });
  callbacks.current = { onChange, onCancelPreview };
  const finish = () => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.changed && !active.cancelled) callbacks.current.onChange(active.value);
  };
  const cancel = () => {
    const active = gesture.current;
    if (!active || active.cancelled) return;
    // Keep this gesture cancelled until release: native range input can still
    // emit changes when the pointer moves after Escape.
    active.cancelled = true;
    if (active.changed) callbacks.current.onCancelPreview?.();
  };
  useEffect(() => {
    const end = () => {
      const active = gesture.current;
      gesture.current = null;
      if (active?.changed && !active.cancelled) callbacks.current.onChange(active.value);
    };
    const abort = () => {
      const active = gesture.current;
      if (!active || active.cancelled) return;
      active.cancelled = true;
      if (active.changed) callbacks.current.onCancelPreview?.();
    };
    // Native range controls own pointer capture (WebKit's thumb stops dragging
    // if capture is transferred to the host input). Finish outside the input too.
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('blur', abort);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('blur', abort);
      abort();
      gesture.current = null;
    };
  }, []);
  return (
    <div className="font-size-control">
      <div className="font-size-heading">
        <label className="property-label" htmlFor={id}>
          {label}
          <span aria-hidden="true">{Math.round(effectiveValue)} px</span>
        </label>
        {onAuto && (
          <button type="button" className="font-size-auto" aria-pressed={auto} onClick={onAuto}>
            Auto
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={gesture.current?.max ?? max}
        step={1}
        value={value}
        aria-valuetext={`${Math.round(effectiveValue)} px${auto ? ', automatic' : effectiveValue < value ? `, fits from ${Math.round(value)} px` : ''}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || !onPreview) return;
          gesture.current = { value, startValue: value, max, changed: false, cancelled: false };
        }}
        onChange={(event) => {
          if (gesture.current?.cancelled) {
            event.currentTarget.value = String(gesture.current.startValue);
            return;
          }
          const next = Number(event.target.value);
          if (gesture.current && onPreview) {
            gesture.current.value = next;
            gesture.current.changed = true;
            onPreview(next);
          } else onChange(next);
        }}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          } else if (
            gesture.current?.cancelled &&
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          ) {
            // A new keyboard adjustment is intentional, even if a native
            // pointercancel ended the previous pointer stream without pointerup.
            gesture.current = null;
          }
        }}
      />
      <div className="font-size-presets" role="group" aria-label={`${label} presets`}>
        {presets.map((size) => (
          <button
            key={size}
            type="button"
            aria-label={`${size} px`}
            aria-pressed={!auto && value === size}
            onClick={() => onChange(size)}
          >
            {size}
          </button>
        ))}
      </div>
      {!auto && effectiveValue < value && (
        <p className="font-size-fit">Fits from {Math.round(value)} px to keep all text inside.</p>
      )}
    </div>
  );
}
