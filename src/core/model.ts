/** Image coordinates are always source pixels, independent of editor zoom and display DPI. */
export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface StrokePoint extends Point {
  pressure: number;
  time?: number;
  input?: 'pen' | 'mouse';
}

export interface BrushSettings {
  smoothing: number;
  pressure: number;
  speed: number;
}

export interface ObjectStyle {
  color: string;
  width: number;
  sketch: boolean;
  /** Every document object supports shadows; omitted legacy values default to soft. */
  shadow?: boolean;
  shadowKind?: 'soft' | 'hard';
}

interface ObjectBase {
  id: string;
  seed: number;
  style: ObjectStyle;
  note?: string;
  labelFontSize?: number;
  labelPosition?: 'top' | 'bottom' | 'inside' | 'free';
  /** Source-pixel offset from the owner anchor, preserved on move and resize. */
  labelOffset?: Point;
}

export interface ArrowObject extends ObjectBase {
  type: 'arrow';
  start: Point;
  end: Point;
  control: Point;
  mode?: 'straight' | 'curved';
  label: string;
  /** Label typography is independent of the arrow's stroke thickness. Defaults to 20. */
  labelFontSize?: number;
  /** Source-pixel offset from the default tail label position. */
  labelOffset: Point;
}

export interface PenObject extends ObjectBase {
  type: 'pen';
  points: StrokePoint[];
  brush?: BrushSettings;
}

export interface StickyObject extends ObjectBase {
  type: 'sticky';
  rect: Rect;
  text: string;
  /** Stored manual preference; automatic fitting derives its size from the card. */
  fontSize: number;
  /** Omitted legacy values use automatic fill, just like newly created cards. */
  fontSizing?: 'auto' | 'manual';
}

export interface RectangleObject extends ObjectBase {
  type: 'rectangle' | 'redact';
  rect: Rect;
}

export interface TextObject extends ObjectBase {
  type: 'text';
  position: Point;
  text: string;
  fontSize: number;
  /** Fixed wrapping width in source pixels. Omitted legacy objects keep automatic width. */
  width?: number;
}

export interface StepObject extends ObjectBase {
  type: 'step';
  center: Point;
  radius: number;
  number: number;
}

export interface BlurObject extends ObjectBase {
  type: 'blur';
  rect: Rect;
  strength: number;
}

export interface MagnifierObject extends ObjectBase {
  type: 'magnifier';
  center: Point;
  radius: number;
  zoom: number;
}

/** Decoded pixels live in the editor-session asset registry, outside document history. */
export interface ImageObject extends ObjectBase {
  type: 'image';
  assetId: string;
  rect: Rect;
}

export type DrawingObject =
  | ArrowObject
  | PenObject
  | RectangleObject
  | TextObject
  | StepObject
  | BlurObject
  | MagnifierObject
  | ImageObject
  | StickyObject;
export type Tool =
  | 'select'
  | 'arrow'
  | 'pen'
  | 'rectangle'
  | 'text'
  | 'sticky'
  | 'redact'
  | 'crop'
  | 'step'
  | 'blur'
  | 'magnifier';
export type ArrowHandle = 'start' | 'end' | 'control' | 'label';

export interface EditorDocument {
  version: 1;
  objects: DrawingObject[];
  crop: Rect | null;
}

export const DEFAULT_STYLE: ObjectStyle = { color: '#e05252', width: 4, sketch: true };
export const EMPTY_DOCUMENT: EditorDocument = { version: 1, objects: [], crop: null };

export function nextStepNumber(objects: readonly DrawingObject[]): number {
  return (
    objects.reduce(
      (maximum, object) => (object.type === 'step' ? Math.max(maximum, object.number) : maximum),
      0,
    ) + 1
  );
}

export function newObjectBase(style: ObjectStyle): ObjectBase {
  return {
    id: crypto.randomUUID(),
    seed: Math.floor(Math.random() * 2147483646) + 1,
    style: { ...style },
  };
}
