import { Copy, Trash2, BringToFront, SendToBack } from 'lucide-react';
import type { BrushSettings, DrawingObject, ObjectStyle, Rect, Tool } from '../core/model';
import { BrushProperties } from './BrushProperties';
import { objectText, withLabelPosition } from '../core/notes';
import { IconButton } from '../ui/IconButton';
import { EffectsProperties } from './EffectsProperties';

const COLORS = ['#e05252', '#e99b38', '#5b9a70', '#4f89c8', '#8e6bc7', '#282832', '#ffffff'];
interface Props {
  tool: Tool;
  style: ObjectStyle;
  selected?: DrawingObject;
  sceneBounds: Rect;
  onStyle: (style: Partial<ObjectStyle>) => void;
  onLabel: (value: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onFontSize: (value: number) => void;
  onUpdate: (object: DrawingObject) => void;
  canBringForward: boolean;
  canSendBackward: boolean;
  onReorder: (direction: 'forward' | 'backward') => void;
  arrowMode: 'straight' | 'curved';
  onArrowMode: (mode: 'straight' | 'curved') => void;
  brush: BrushSettings;
  onBrush: (brush: BrushSettings) => void;
}

export function Properties({
  tool,
  style,
  selected,
  sceneBounds,
  onStyle,
  onLabel,
  onDelete,
  onDuplicate,
  onFontSize,
  onUpdate,
  canBringForward,
  canSendBackward,
  onReorder,
  arrowMode,
  onArrowMode,
  brush,
  onBrush,
}: Props) {
  const type = selected?.type ?? tool;
  if (type === 'select' || type === 'crop') return null;
  const isRedact = type === 'redact';
  return (
    <aside className="properties-panel" aria-label="Drawing properties">
      <div className="property-heading">
        {type === 'redact'
          ? 'Redaction'
          : type === 'sticky'
            ? 'Sticky note'
            : type[0]!.toUpperCase() + type.slice(1)}
        <span>{selected ? 'Selected' : 'Style'}</span>
      </div>
      {!isRedact && type !== 'blur' && type !== 'image' && (
        <>
          <label className="property-label">
            {type === 'step' || type === 'sticky' ? 'Fill' : 'Stroke'}
          </label>
          <div className="color-row">
            {(type === 'sticky'
              ? ['#ffe58f', '#ffd6df', '#c9edcf', '#cfe4ff', '#e2d5ff', '#ffffff', '#282832']
              : COLORS
            ).map((color) => (
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
      {type === 'arrow' && (
        <div className="style-switch" role="group" aria-label="Arrow mode">
          {(['straight', 'curved'] as const).map((mode) => (
            <button
              key={mode}
              className={arrowMode === mode ? 'chosen' : ''}
              aria-pressed={arrowMode === mode}
              onClick={() => onArrowMode(mode)}
            >
              {mode === 'straight' ? 'Straight' : 'Curved'}
            </button>
          ))}
        </div>
      )}
      <>
        <label className="shadow-option">
          <input
            type="checkbox"
            checked={style.shadow !== false}
            onChange={(event) => onStyle({ shadow: event.target.checked })}
          />
          Shadow
        </label>
        <div className="style-switch" role="group" aria-label="Shadow style">
          {(['soft', 'hard'] as const).map((kind) => (
            <button
              key={kind}
              className={
                style.shadow !== false && (style.shadowKind ?? 'soft') === kind ? 'chosen' : ''
              }
              aria-pressed={style.shadow !== false && (style.shadowKind ?? 'soft') === kind}
              onClick={() => onStyle({ shadow: true, shadowKind: kind })}
            >
              {kind === 'soft' ? 'Soft' : 'Hard'}
            </button>
          ))}
        </div>
      </>
      {type === 'pen' && <BrushProperties value={brush} onChange={onBrush} />}
      {selected && selected.type !== 'arrow' && selected.type !== 'text' && (
        <div className="label-property">
          <label className="property-label" htmlFor="shape-note">
            Note
          </label>
          <textarea
            id="shape-note"
            aria-label="Shape note"
            rows={3}
            value={objectText(selected)}
            onChange={(event) => onLabel(event.target.value)}
            placeholder="Double-click the shape to type…"
          />
        </div>
      )}
      {selected && !['arrow', 'text', 'sticky'].includes(selected.type) && (
        <div className="label-property">
          <label className="property-label" htmlFor="shape-label-position">
            Label position
          </label>
          <select
            id="shape-label-position"
            value={
              selected.labelPosition ??
              (selected.type === 'rectangle'
                ? 'top'
                : selected.type === 'step'
                  ? 'bottom'
                  : 'inside')
            }
            onChange={(event) =>
              onUpdate(
                withLabelPosition(
                  selected,
                  event.target.value as 'top' | 'bottom' | 'inside' | 'free',
                  sceneBounds,
                ),
              )
            }
          >
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="inside">Inside</option>
            <option value="free">Free (draggable)</option>
          </select>
          <label className="property-label" htmlFor="shape-label-size">
            Label size
          </label>
          <select
            id="shape-label-size"
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
          <p className="property-note">
            Drag the label to reposition it. It follows the shape when moved or resized.
          </p>
        </div>
      )}
      {type === 'sticky' && (
        <p className="property-note">
          Double-click to type. Drag to move; resize from a corner. Only card text scales when
          resized.
        </p>
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
          <button onClick={() => onUpdate({ ...selected, labelOffset: { x: 0, y: 0 } })}>
            Reset label position
          </button>
          <p className="property-note">
            Drag the label to reposition it. It follows the arrow when moved or resized; long labels
            wrap.
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
          <p className="property-note">
            Reorder images and drawings together. Privacy effects stay on top.
          </p>
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
            ? 'Drag an endpoint to aim. In Curved mode, drag the bend handle.'
            : 'Choose Straight or Curved, then drag. Hold Shift to draw straight.'}
        </p>
      )}
    </aside>
  );
}
