import { Copy, Trash2, BringToFront, SendToBack } from 'lucide-react';
import type { DrawingObject, ObjectStyle, Tool } from '../core/model';
import { IconButton } from '../ui/IconButton';
import { EffectsProperties } from './EffectsProperties';

const COLORS = ['#e05252', '#e99b38', '#5b9a70', '#4f89c8', '#8e6bc7', '#282832', '#ffffff'];
interface Props {
  tool: Tool;
  style: ObjectStyle;
  selected?: DrawingObject;
  onStyle: (style: Partial<ObjectStyle>) => void;
  onLabel: (value: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFontSize: (value: number) => void;
  onUpdate: (object: DrawingObject) => void;
  canBringForward: boolean;
  canSendBackward: boolean;
  onReorder: (direction: 'forward' | 'backward') => void;
}

export function Properties({
  tool,
  style,
  selected,
  onStyle,
  onLabel,
  onDelete,
  onDuplicate,
  onFontSize,
  onUpdate,
  canBringForward,
  canSendBackward,
  onReorder,
}: Props) {
  const type = selected?.type ?? tool;
  if (type === 'select' || type === 'crop') return null;
  const isRedact = type === 'redact';
  return (
    <aside className="properties-panel" aria-label="Drawing properties">
      <div className="property-heading">
        {type === 'redact' ? 'Redaction' : type[0]!.toUpperCase() + type.slice(1)}
        <span>{selected ? 'Selected' : 'Style'}</span>
      </div>
      {!isRedact && type !== 'blur' && type !== 'image' && (
        <>
          <label className="property-label">{type === 'step' ? 'Fill' : 'Stroke'}</label>
          <div className="color-row">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-swatch ${style.color === color ? 'chosen' : ''}`}
                style={{ background: color }}
                aria-label={`Color ${color}`}
                aria-pressed={style.color === color}
                onClick={() => onStyle({ color })}
              />
            ))}
          </div>
          <label className="custom-color">
            <input
              type="color"
              aria-label="Custom color"
              value={style.color}
              onChange={(event) => onStyle({ color: event.target.value })}
            />
            <span>{style.color.toUpperCase()}</span>
          </label>
          {['arrow', 'pen', 'rectangle', 'magnifier'].includes(type) && (
            <>
              <label className="property-label" htmlFor="stroke-width">
                Thickness <span>{style.width} px</span>
              </label>
              <input
                id="stroke-width"
                type="range"
                min="1"
                max="16"
                value={style.width}
                onChange={(event) => onStyle({ width: Number(event.target.value) })}
              />
              {['arrow', 'rectangle'].includes(type) && (
                <div className="style-switch" role="group" aria-label="Stroke style">
                  <button
                    className={style.sketch ? 'chosen' : ''}
                    aria-pressed={style.sketch}
                    onClick={() => onStyle({ sketch: true })}
                  >
                    Sketch
                  </button>
                  <button
                    className={!style.sketch ? 'chosen' : ''}
                    aria-pressed={!style.sketch}
                    onClick={() => onStyle({ sketch: false })}
                  >
                    Clean
                  </button>
                </div>
              )}
            </>
          )}
          {selected?.type === 'text' && (
            <>
              <label className="property-label" htmlFor="font-size">
                Font size
              </label>
              <select
                id="font-size"
                value={selected.fontSize}
                onChange={(event) => onFontSize(Number(event.target.value))}
              >
                {[16, 20, 24, 32, 40, 48].map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}
      {isRedact && (
        <p className="property-note">
          Cover private details with solid black. The exported image contains only the covered
          pixels.
        </p>
      )}
      {selected?.type === 'image' && (
        <>
          <p className="property-label" aria-label="Image dimensions">
            {Math.round(selected.rect.width)} × {Math.round(selected.rect.height)} px
          </p>
          <p className="property-note">
            Drag to move. Drag a corner to resize; proportions stay locked.
          </p>
        </>
      )}
      {selected && <EffectsProperties selected={selected} onUpdate={onUpdate} />}
      {type === 'blur' && (
        <p className="property-note">
          Drag a region to soften its details. Blur is not secure hiding—use Redact for passwords
          and private information.
        </p>
      )}
      {type === 'magnifier' && (
        <p className="property-note">
          {selected
            ? 'Drag the lens to enlarge another detail. It appears in copied and downloaded images.'
            : 'Click to place a circular lens, or drag from its center to choose the size.'}
        </p>
      )}
      {type === 'step' && (
        <p className="property-note">
          Click repeatedly for 1, 2, 3… Press V to select and move a step. New steps follow the
          highest existing number.
        </p>
      )}
      {selected?.type === 'arrow' && (
        <div className="label-property">
          <label className="property-label" htmlFor="arrow-label">
            Label
          </label>
          <textarea
            id="arrow-label"
            aria-label="Arrow label"
            rows={2}
            placeholder="Add a little context…"
            value={selected.label}
            onChange={(event) => onLabel(event.target.value)}
          />
          <label className="property-label" htmlFor="label-font-size">
            Label size
          </label>
          <select
            id="label-font-size"
            value={selected.labelFontSize ?? 20}
            onChange={(event) =>
              onUpdate({ ...selected, labelFontSize: Number(event.target.value) })
            }
          >
            {[16, 20, 24, 28, 32].map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
          <button
            className="property-reset"
            onClick={() => onUpdate({ ...selected, labelOffset: { x: 0, y: 0 } })}
          >
            Reset label position
          </button>
          <p className="property-note">
            Drag the label to move it. Long labels wrap; very long labels end with … in the image.
          </p>
        </div>
      )}
      {selected && (
        <>
          <div className="object-actions layer-actions">
            <span>Layer</span>
            <IconButton
              label="Send backward"
              disabled={!canSendBackward}
              onClick={() => onReorder('backward')}
            >
              <SendToBack size={15} />
            </IconButton>
            <IconButton
              label="Bring forward"
              disabled={!canBringForward}
              onClick={() => onReorder('forward')}
            >
              <BringToFront size={15} />
            </IconButton>
          </div>
          <p className="property-note">Images stay below drawings. Redaction stays on top.</p>
          <div className="object-actions">
            <span>Object</span>
            <IconButton label="Duplicate object" onClick={onDuplicate}>
              <Copy size={15} />
            </IconButton>
            <IconButton label="Delete object" onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </>
      )}
      {type === 'arrow' && (
        <p className="property-note">
          {selected
            ? 'Drag an endpoint to aim. Move the middle handle to bend.'
            : 'Drag to draw a curve. Hold Shift for a straight arrow.'}
        </p>
      )}
    </aside>
  );
}
