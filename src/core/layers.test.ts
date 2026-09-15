import { describe, expect, it } from 'vitest';
import { canReorderObject, objectsInPaintOrder, reorderObject } from './layers';
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
const image: DrawingObject = { ...base, id: 'image', type: 'image', rect, assetId: 'asset-1' };
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

  it('uses stable image, blur, lens, annotation, redaction passes without mutating document order', () => {
    const objects: DrawingObject[] = [
      redaction,
      step,
      lens,
      blur,
      { ...step, id: 'step-2', number: 2 },
      { ...lens, id: 'lens-2' },
      image,
      { ...image, id: 'image-2' },
    ];
    const original = objects.map((object) => object.id);
    expect(objectsInPaintOrder(objects).map((object) => object.id)).toEqual([
      'image',
      'image-2',
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

describe('same-family object ordering', () => {
  const secondImage: DrawingObject = { ...image, id: 'image-2' };
  const thirdImage: DrawingObject = { ...image, id: 'image-3' };
  const objects = [image, step, blur, secondImage, lens, thirdImage, redaction];

  it('brings an image forward by one image, leaving other families in place', () => {
    const original = [...objects];
    const reordered = reorderObject(objects, image.id, 'forward');
    expect(reordered).toEqual([secondImage, step, blur, image, lens, thirdImage, redaction]);
    expect(objects).toEqual(original);
    expect(reordered[3]).toBe(image);
    expect(reordered[1]).toBe(step);
  });

  it('sends an image backward by one image without crossing into another family', () => {
    expect(reorderObject(objects, thirdImage.id, 'backward')).toEqual([
      image,
      step,
      blur,
      thirdImage,
      lens,
      secondImage,
      redaction,
    ]);
  });

  it('allows different ordinary annotation types to reorder together', () => {
    const rectangle: DrawingObject = { ...base, id: 'rectangle', type: 'rectangle', rect };
    expect(reorderObject([step, image, rectangle, redaction], step.id, 'forward')).toEqual([
      rectangle,
      image,
      step,
      redaction,
    ]);
  });

  it('allows redactions to reorder only with other redactions', () => {
    const secondRedaction: DrawingObject = { ...redaction, id: 'redaction-2' };
    expect(
      reorderObject([redaction, image, secondRedaction, step], redaction.id, 'forward'),
    ).toEqual([secondRedaction, image, redaction, step]);
  });

  it('reports image-family boundaries rather than document-array boundaries', () => {
    expect(canReorderObject(objects, image.id, 'backward')).toBe(false);
    expect(canReorderObject(objects, image.id, 'forward')).toBe(true);
    expect(canReorderObject(objects, secondImage.id, 'forward')).toBe(true);
    expect(canReorderObject(objects, secondImage.id, 'backward')).toBe(true);
    expect(canReorderObject(objects, thirdImage.id, 'forward')).toBe(false);
    expect(canReorderObject(objects, redaction.id, 'backward')).toBe(false);
    expect(canReorderObject(objects, 'missing', 'forward')).toBe(false);
  });

  it('preserves the original array for no-op moves, including readonly inputs', () => {
    const frozen = Object.freeze([...objects]);
    expect(reorderObject(objects, image.id, 'backward')).toBe(objects);
    expect(reorderObject(objects, thirdImage.id, 'forward')).toBe(objects);
    expect(reorderObject(objects, 'missing', 'forward')).toBe(objects);
    expect(reorderObject(frozen, redaction.id, 'backward')).toBe(frozen);
    expect(reorderObject(frozen, image.id, 'forward')[0]).toBe(secondImage);
  });
});
