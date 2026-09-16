import { describe, expect, it } from 'vitest';
import {
  autoControl,
  arrowLabelFontSize,
  clampRect,
  getArrowLabelPosition,
  hitTestObject,
  moveArrowHandle,
  moveObject,
  normalizeRect,
  objectBounds,
  quadraticPoint,
} from './geometry';
import {
  nextStepNumber,
  type ArrowObject,
  type BlurObject,
  type DrawingObject,
  type ImageObject,
  type MagnifierObject,
  type PenObject,
  type StepObject,
} from './model';
import { getArrowLabelLayout } from './arrow-label';
import { penOutline } from './brush';

const arrow: ArrowObject = {
  id: 'arrow',
  seed: 1,
  type: 'arrow',
  style: { color: '#ff0000', width: 4, sketch: true },
  start: { x: 0, y: 0 },
  end: { x: 200, y: 0 },
  control: { x: 100, y: 100 },
  label: 'Fix this',
  labelOffset: { x: 0, y: -20 },
};

describe('quadratic arrow geometry', () => {
  it('keeps the default arrow label font independent of stroke thickness', () => {
    expect(arrowLabelFontSize({ ...arrow, style: { ...arrow.style, width: 16 } })).toBe(20);
  });

  it('bounds long unbroken labels instead of extending across the screenshot', () => {
    const layout = getArrowLabelLayout({ ...arrow, label: 'longlabel'.repeat(60) });
    expect(layout.rect.width).toBeLessThanOrEqual(320);
  });

  it('places the label by the tail with its saved offset', () => {
    expect(quadraticPoint(arrow.start, arrow.control, arrow.end, 0.5)).toEqual({
      x: 100,
      y: 50,
    });
    expect(getArrowLabelPosition(arrow)).toEqual(getArrowLabelLayout(arrow).center);
    expect(getArrowLabelPosition(arrow).x).toBe(arrow.start.x);
  });

  it('creates a gentle perpendicular curve and supports a straight arrow', () => {
    const curved = autoControl({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(curved.x).toBe(100);
    expect(curved.y).toBeGreaterThan(0);
    expect(curved.y).toBeLessThan(50);
    expect(autoControl(arrow.start, arrow.end, true)).toEqual({ x: 100, y: 0 });
    expect(autoControl(arrow.start, arrow.start)).toEqual(arrow.start);
  });

  it('moves geometry and labels together without mutating the original', () => {
    const before = structuredClone(arrow);
    const moved = moveObject(arrow, { x: 30, y: -10 }) as ArrowObject;
    expect(getArrowLabelPosition(moved)).toEqual({
      x: getArrowLabelPosition(arrow).x + 30,
      y: getArrowLabelPosition(arrow).y - 10,
    });
    expect(moved.start).toEqual({ x: 30, y: -10 });
    expect(moved.control).toEqual({ x: 130, y: 90 });
    expect(arrow).toEqual(before);
  });

  it('preserves the bend as an endpoint moves and moves only its label', () => {
    const resized = moveArrowHandle(arrow, 'end', { x: 300, y: 40 });
    expect(resized.control).toEqual({ x: 150, y: 120 });
    expect(resized.start).toEqual(arrow.start);
    const movedLabel = moveArrowHandle(resized, 'label', { x: 170, y: 95 });
    expect(getArrowLabelPosition(movedLabel)).toEqual({ x: 170, y: 95 });
    expect(movedLabel.end).toEqual(resized.end);
    expect(arrow.end).toEqual({ x: 200, y: 0 });
  });

  it.each([undefined, 'straight', 'curved'] as const)(
    'switches %s arrows to curved when the bend handle is dragged without moving labels or endpoints',
    (mode) => {
      const original: ArrowObject = { ...arrow, mode };
      const before = structuredClone(original);
      const bent = moveArrowHandle(original, 'control', { x: 120, y: 180 });
      expect(bent).toEqual({ ...original, mode: 'curved', control: { x: 120, y: 180 } });
      expect(original).toEqual(before);
      expect(hitTestObject({ ...bent, label: '' }, { x: 110, y: 90 }, 2)).toBe(true);
    },
  );

  it('keeps a straight arrow straight when an endpoint is dragged', () => {
    const straight: ArrowObject = { ...arrow, mode: 'straight' };
    const moved = moveArrowHandle(straight, 'end', { x: 300, y: 40 });
    expect(moved.mode).toBe('straight');
    expect(moved.labelOffset).toEqual(straight.labelOffset);
    expect(hitTestObject({ ...moved, label: '' }, { x: 150, y: 20 }, 2)).toBe(true);
  });

  it('uses a straight mode for hit testing even when a stored curved handle exists', () => {
    const straight = { ...arrow, label: '', mode: 'straight' as const };
    expect(hitTestObject(straight, { x: 100, y: 0 }, 2)).toBe(true);
    expect(hitTestObject(straight, { x: 100, y: 50 }, 2)).toBe(false);
  });

  it('hits the actual curved path instead of the line between endpoints', () => {
    const unlabeled = { ...arrow, label: '' };
    expect(hitTestObject(unlabeled, { x: 100, y: 52 }, 3)).toBe(true);
    expect(hitTestObject(unlabeled, { x: 100, y: 0 }, 3)).toBe(false);
    expect(hitTestObject(arrow, getArrowLabelLayout(arrow).center, 3)).toBe(true);
    expect(hitTestObject(unlabeled, { x: 300, y: 300 }, 3)).toBe(false);
  });

  it('includes the curve extrema in object bounds', () => {
    const bounds = objectBounds({ ...arrow, label: '' });
    expect(bounds.x).toBeLessThanOrEqual(0);
    expect(bounds.y).toBeLessThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(200);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(50);
    expect(bounds.y + bounds.height).toBeLessThan(100);
  });
});

describe('pressure-sensitive pen selection', () => {
  const pen: PenObject = {
    id: 'pressure-pen',
    seed: 1,
    type: 'pen',
    style: { color: '#e05252', width: 16, sketch: false },
    brush: { smoothing: 0.6, pressure: 1, speed: 1 },
    points: Array.from({ length: 41 }, (_, index) => ({
      x: 100 + index * 10,
      y: 100,
      pressure: 1,
      input: 'pen',
    })),
  };

  it('bounds every outline point, including ink twice the nominal radius', () => {
    const bounds = objectBounds(pen);
    expect(bounds.y).toBeCloseTo(68);
    expect(bounds.height).toBeCloseTo(64);
    for (const [x, y] of penOutline(pen)) {
      expect(x).toBeGreaterThanOrEqual(bounds.x);
      expect(x).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(y).toBeGreaterThanOrEqual(bounds.y);
      expect(y).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });

  it('selects thick outer ink and respects tolerance outside the actual outline', () => {
    expect(hitTestObject(pen, { x: 300, y: 130 }, 0)).toBe(true);
    expect(hitTestObject(pen, { x: 70, y: 100 }, 0)).toBe(true);
    expect(hitTestObject(pen, { x: 300, y: 133 }, 0)).toBe(false);
    expect(hitTestObject(pen, { x: 300, y: 133 }, 2)).toBe(true);
  });

  it('does not select blank space beside a light-pressure stroke', () => {
    const light = { ...pen, points: pen.points.map((point) => ({ ...point, pressure: 0.1 })) };
    expect(hitTestObject(light, { x: 300, y: 110 }, 0)).toBe(false);
    expect(hitTestObject(light, { x: 300, y: 102 }, 0)).toBe(true);
  });

  it('selects pressure-sized dots and never selects an empty pen object', () => {
    expect(hitTestObject({ ...pen, points: [pen.points[0]!] }, { x: 123, y: 100 }, 0)).toBe(true);
    expect(hitTestObject({ ...pen, points: [] }, { x: 0, y: 0 }, 6)).toBe(false);
  });
});

describe('other drawing geometry', () => {
  const image: ImageObject = {
    id: 'image',
    seed: 1,
    style: { ...arrow.style, width: 16 },
    type: 'image',
    assetId: 'asset-1',
    rect: { x: 20, y: 30, width: 80, height: 40 },
  };

  it('bounds image objects by their displayed rectangle without stroke padding', () => {
    expect(objectBounds(image)).toEqual(image.rect);
  });

  it('moves image objects without changing their asset or mutating the source', () => {
    const original = structuredClone(image);
    expect(moveObject(image, { x: 15, y: -10 })).toEqual({
      ...image,
      rect: { x: 35, y: 20, width: 80, height: 40 },
    });
    expect(image).toEqual(original);
  });

  it('hits the full image rectangle with only the requested hit tolerance', () => {
    expect(hitTestObject(image, { x: 60, y: 50 }, 0)).toBe(true);
    expect(hitTestObject(image, { x: 101, y: 50 }, 0)).toBe(false);
    expect(hitTestObject(image, { x: 103, y: 50 }, 4)).toBe(true);
    expect(hitTestObject(image, { x: 105, y: 50 }, 4)).toBe(false);
  });

  it('selects and translates numbered steps without mutating their numbers', () => {
    const step: StepObject = {
      id: 'step',
      seed: 1,
      style: arrow.style,
      type: 'step',
      center: { x: 80, y: 60 },
      radius: 20,
      number: 5,
    };
    expect(hitTestObject(step, { x: 80, y: 60 }, 0)).toBe(true);
    expect(hitTestObject(step, { x: 98, y: 78 }, 0)).toBe(false);
    expect(objectBounds(step)).toEqual({ x: 58, y: 38, width: 44, height: 44 });
    expect(moveObject(step, { x: 10, y: -20 })).toMatchObject({
      center: { x: 90, y: 40 },
      number: 5,
    });
    expect(step.center).toEqual({ x: 80, y: 60 });
    expect(nextStepNumber([arrow, step, { ...step, id: 'previous', number: 2 }])).toBe(6);
    expect(nextStepNumber([])).toBe(1);
  });

  it('treats blur regions as filled areas and translates the source region', () => {
    const blur: BlurObject = {
      id: 'blur',
      seed: 1,
      style: arrow.style,
      type: 'blur',
      rect: { x: 20, y: 30, width: 80, height: 40 },
      strength: 12,
    };
    expect(hitTestObject(blur, { x: 60, y: 50 }, 0)).toBe(true);
    expect(hitTestObject(blur, { x: 110, y: 50 }, 0)).toBe(false);
    expect(objectBounds(blur)).toEqual(blur.rect);
    expect(moveObject(blur, { x: 5, y: 10 })).toMatchObject({
      rect: { x: 25, y: 40, width: 80, height: 40 },
      strength: 12,
    });
    expect(blur.rect.x).toBe(20);
  });

  it('hits circular magnifiers within their radius rather than their bounding square', () => {
    const lens: MagnifierObject = {
      id: 'lens',
      seed: 1,
      style: arrow.style,
      type: 'magnifier',
      center: { x: 100, y: 100 },
      radius: 40,
      zoom: 2,
    };
    expect(hitTestObject(lens, { x: 125, y: 125 }, 0)).toBe(true);
    expect(hitTestObject(lens, { x: 139, y: 139 }, 0)).toBe(false);
    expect(moveObject(lens, { x: 40, y: 20 })).toMatchObject({
      center: { x: 140, y: 120 },
      zoom: 2,
    });
    expect(lens.center).toEqual({ x: 100, y: 100 });
  });

  it('normalizes and clamps a reverse-direction crop to the image', () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: -10, y: 20 })).toEqual({
      x: -10,
      y: 20,
      width: 110,
      height: 60,
    });
    expect(clampRect({ x: -10, y: 20, width: 110, height: 90 }, 80, 100)).toEqual({
      x: 0,
      y: 20,
      width: 80,
      height: 80,
    });
    expect(clampRect({ x: 120, y: 150, width: 10, height: 20 }, 80, 100)).toEqual({
      x: 80,
      y: 100,
      width: 0,
      height: 0,
    });
  });

  it('hits rectangle borders, redacted interiors, text and pen strokes', () => {
    const base = { id: 'object', seed: 1, style: arrow.style };
    const rectangle: DrawingObject = {
      ...base,
      type: 'rectangle',
      rect: { x: 20, y: 20, width: 100, height: 80 },
    };
    expect(hitTestObject(rectangle, { x: 20, y: 50 }, 2)).toBe(true);
    expect(hitTestObject(rectangle, { x: 70, y: 50 }, 2)).toBe(false);
    expect(hitTestObject({ ...rectangle, type: 'redact' }, { x: 70, y: 50 }, 2)).toBe(true);
    expect(
      hitTestObject(
        { ...base, type: 'text', text: 'hello', position: { x: 20, y: 20 }, fontSize: 24 },
        { x: 30, y: 30 },
        2,
      ),
    ).toBe(true);
    const pen: DrawingObject = {
      ...base,
      type: 'pen',
      points: [
        { x: 10, y: 10, pressure: 0.5 },
        { x: 50, y: 50, pressure: 0.9 },
      ],
    };
    expect(hitTestObject(pen, { x: 30, y: 30 }, 2)).toBe(true);
    expect(hitTestObject(pen, { x: 50, y: 10 }, 2)).toBe(false);
    expect(moveObject(pen, { x: 10, y: 20 })).toMatchObject({
      points: [
        { x: 20, y: 30, pressure: 0.5 },
        { x: 60, y: 70, pressure: 0.9 },
      ],
    });
    expect(pen.points[0]).toEqual({ x: 10, y: 10, pressure: 0.5 });
  });
});

describe('separate shape and label hit regions', () => {
  it.each(['image', 'redact', 'blur'] as const)(
    'does not select %s in empty space between a shape and its free label',
    (type) => {
      const object = {
        id: 'shape',
        seed: 1,
        style: arrow.style,
        type,
        rect: { x: 100, y: 100, width: 100, height: 100 },
        assetId: 'asset',
        strength: 12,
        note: 'Label',
        labelPosition: 'free' as const,
        labelOffset: { x: 400, y: 0 },
      };
      expect(hitTestObject(object, { x: 150, y: 150 })).toBe(true);
      expect(hitTestObject(object, { x: 550, y: 150 })).toBe(true);
      expect(hitTestObject(object, { x: 350, y: 150 })).toBe(false);
    },
  );
});
