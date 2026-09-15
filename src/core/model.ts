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
}

export interface ObjectStyle {
  color: string;
  width: number;
  sketch: boolean;
}

interface ObjectBase {
  id: string;
  seed: number;
  style: ObjectStyle;
}

export interface ArrowObject extends ObjectBase {
  type: 'arrow';
  start: Point;
  end: Point;
  control: Point;
  label: string;
  /** Label typography is independent of the arrow's stroke thickness. Defaults to 20. */
  labelFontSize?: number;
  /** Offset from the quadratic curve midpoint, so labels follow moved/reshaped arrows. */
  labelOffset: Point;
}

export interface PenObject extends ObjectBase {
  type: 'pen';
  points: StrokePoint[];
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

export type DrawingObject =
  | ArrowObject
  | PenObject
  | RectangleObject
  | TextObject
  | StepObject
  | BlurObject
  | MagnifierObject;
export type Tool =
  | 'select'
  | 'arrow'
  | 'pen'
  | 'rectangle'
  | 'text'
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
