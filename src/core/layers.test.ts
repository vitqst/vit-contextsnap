import { describe, expect, it } from 'vitest';
import { objectsInPaintOrder } from './layers';
import { hitTestObject } from './geometry';
import type { DrawingObject } from './model';

const base = { seed: 1, style: { color: '#e05252', width: 4, sketch: false } };
const rect = { x: 10, y: 10, width: 180, height: 180 };
const redaction: DrawingObject = { ...base, id: 'redaction', type: 'redact', rect };
const lens: DrawingObject = {
  ...base,
  id: 'lens',
  type: 'magnifier',
  center: { x: 100, y: 100 },
  radius: 60,
  zoom: 2,
};
const blur: DrawingObject = { ...base, id: 'blur', type: 'blur', rect, strength: 12 };
const step: DrawingObject = {
  ...base,
  id: 'step',
  type: 'step',
  center: { x: 100, y: 100 },
  radius: 22,
  number: 1,
};

describe('scene paint and hit-test order', () => {
  it('selects visible redaction before a lens created later', () => {
    const hit = objectsInPaintOrder([redaction, lens])
      .reverse()
      .find((object) => hitTestObject(object, { x: 100, y: 100 }, 0));
    expect(hit?.id).toBe('redaction');
  });

  it('selects a visible annotation above a blur created later', () => {
    const hit = objectsInPaintOrder([step, blur])
      .reverse()
      .find((object) => hitTestObject(object, { x: 100, y: 100 }, 0));
    expect(hit?.id).toBe('step');
  });

  it('uses stable blur, lens, annotation, redaction passes without mutating document order', () => {
    const objects: DrawingObject[] = [
      redaction,
      step,
      lens,
      blur,
      { ...step, id: 'step-2', number: 2 },
      { ...lens, id: 'lens-2' },
    ];
    const original = objects.map((object) => object.id);
    expect(objectsInPaintOrder(objects).map((object) => object.id)).toEqual([
      'blur',
      'lens',
      'lens-2',
      'step',
      'step-2',
      'redaction',
    ]);
    expect(objects.map((object) => object.id)).toEqual(original);
    expect(objectsInPaintOrder([])).toEqual([]);
  });
});
