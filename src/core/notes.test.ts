import { describe, expect, it, vi } from 'vitest';
import {
  createSticky,
  getNoteLayout,
  MAX_STICKY_FONT_SIZE,
  MIN_STICKY_FONT_SIZE,
  objectText,
  moveShapeLabelBy,
  withLabelPosition,
  resizeSticky,
  stickyTextColor,
  withObjectText,
} from './notes';
import type { DrawingObject, ObjectStyle, Rect, StickyObject } from './model';
import { measureText } from './label-layout';
import * as measurements from './label-layout';

const style: ObjectStyle = { color: '#ffe58f', width: 4, sketch: false };
const bounds: Rect = { x: 10, y: 20, width: 800, height: 600 };
const sticky: StickyObject = {
  id: 'sticky',
  seed: 1,
  style,
  type: 'sticky',
  rect: { x: 100, y: 100, width: 220, height: 150 },
  text: 'A useful note',
  fontSize: 24,
  fontSizing: 'manual',
};
const rectangle: DrawingObject = {
  id: 'rectangle',
  seed: 2,
  style,
  type: 'rectangle',
  rect: { x: 200, y: 300, width: 240, height: 160 },
  note: 'Shape note',
};

describe('sticky card font sizing', () => {
  const automatic: StickyObject = { ...sticky, text: 'OK', fontSizing: undefined };

  it('fills a card with short text by default, including existing notes without a sizing mode', () => {
    const layout = getNoteLayout(automatic);
    expect(layout.fontSize).toBeGreaterThan(automatic.fontSize);
    expect(layout.lines).toEqual(['OK']);
    expect(layout.truncated).toBe(false);
    expect(layout.lineHeight).toBeLessThanOrEqual(layout.rect.height);
    expect(measureText('OK', layout.fontSize)).toBeLessThanOrEqual(layout.contentWidth);
    expect(getNoteLayout({ ...automatic, fontSize: 8 })).toEqual(layout);
    expect(getNoteLayout({ ...automatic, fontSizing: 'auto' })).toEqual(layout);
  });

  it('grows and shrinks from the actual resized card while preserving the manual preference', () => {
    const before = getNoteLayout(automatic);
    const enlarged = resizeSticky(automatic, 'se', { x: 540, y: 400 });
    const after = getNoteLayout(enlarged);
    expect(after.fontSize).toBeGreaterThan(before.fontSize);
    expect(after.fontSize).toBeGreaterThan(64);
    expect(after.lineHeight * after.lines.length).toBeLessThanOrEqual(after.rect.height);
    expect(enlarged.fontSize).toBe(automatic.fontSize);
    const restored = resizeSticky(enlarged, 'se', { x: 320, y: 250 });
    expect(getNoteLayout(restored)).toEqual(before);
    expect(restored.fontSize).toBe(automatic.fontSize);
  });

  it('shrinks live text to fit and restores the larger auto size when text is removed', () => {
    const before = getNoteLayout(automatic);
    const value = '  A much longer note\nwith several useful details.\n';
    const expanded = getNoteLayout({ ...automatic, text: value });
    expect(expanded.fontSize).toBeLessThan(before.fontSize);
    expect(expanded.fontSize).toBeGreaterThanOrEqual(8);
    expect(expanded.truncated).toBe(false);
    expect(expanded.lines.join('')).toBe(value.replace(/\n/gu, ''));
    expect(expanded.lines.at(-1)).toBe('');
    expect(getNoteLayout({ ...automatic, text: 'OK' })).toEqual(before);
  });

  it('honors large manual preferences and restores auto fill without overwriting them', () => {
    const card: StickyObject = {
      ...sticky,
      text: 'OK',
      fontSize: 96,
      rect: { x: -100, y: -200, width: 800, height: 500 },
    };
    const manual = getNoteLayout(card);
    expect(manual.fontSize).toBe(96);
    const auto = getNoteLayout({ ...card, fontSizing: 'auto' });
    expect(auto.fontSize).toBeGreaterThan(manual.fontSize);
    expect(getNoteLayout({ ...card, fontSizing: 'manual' })).toEqual(manual);
    expect(card.fontSize).toBe(96);
  });

  it('uses bounded font candidates and clips safely when even the minimum cannot fit', () => {
    expect(MIN_STICKY_FONT_SIZE).toBe(8);
    expect(MAX_STICKY_FONT_SIZE).toBe(2048);
    const huge = getNoteLayout({
      ...automatic,
      text: 'A',
      rect: { x: 0, y: 0, width: 10000, height: 10000 },
    });
    expect(huge.fontSize).toBe(2048);
    const tiny = getNoteLayout({
      ...automatic,
      rect: { x: 0, y: 0, width: 12, height: 12 },
    });
    expect(tiny.fontSize).toBe(8);
    expect(tiny.lines).toEqual([]);
    expect(tiny.truncated).toBe(true);
    expect(automatic.text).toBe('OK');
  });

  it('reuses auto metrics during translation but invalidates dimensions and sizing changes', () => {
    const card = { ...automatic, text: 'Auto sizing cache test' };
    const before = getNoteLayout(card);
    const measure = vi.spyOn(measurements, 'measureText');
    try {
      const moved = getNoteLayout({ ...card, rect: { ...card.rect, x: -300, y: 400 } });
      expect(moved.fontSize).toBe(before.fontSize);
      expect(moved.lines).toEqual(before.lines);
      expect(measure).not.toHaveBeenCalled();
      getNoteLayout({ ...card, rect: { ...card.rect, width: 440 } });
      expect(measure).toHaveBeenCalled();
      measure.mockClear();
      expect(getNoteLayout({ ...card, fontSizing: 'manual', fontSize: 12 }).fontSize).toBe(12);
      expect(measure).toHaveBeenCalled();
    } finally {
      measure.mockRestore();
    }
  });
});

describe('shared sticky text contrast', () => {
  it.each([
    ['#ffe58f', '#252432'],
    ['#ffffff', '#252432'],
    ['#fff', '#252432'],
    ['#252432', '#ffffff'],
    ['#000', '#ffffff'],
    ['#3366CC', '#ffffff'],
    ['invalid-color', '#252432'],
  ])('uses readable text over %s in both inline editing and export', (color, expected) => {
    expect(stickyTextColor(color)).toBe(expected);
  });
});

describe('text belongs to its drawing object', () => {
  it.each([
    [{ ...sticky, note: 'not the card text' }, 'A useful note'],
    [
      {
        id: 'a',
        seed: 1,
        style,
        type: 'arrow',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        control: { x: 50, y: 20 },
        label: 'Arrow label',
        labelOffset: { x: 0, y: 0 },
        note: 'not the label',
      },
      'Arrow label',
    ],
    [
      {
        id: 't',
        seed: 1,
        style,
        type: 'text',
        position: { x: 10, y: 20 },
        text: 'Plain text',
        fontSize: 20,
        note: 'not the text',
      },
      'Plain text',
    ],
    [rectangle, 'Shape note'],
    [{ ...rectangle, note: undefined }, ''],
  ] as [DrawingObject, string][])(
    'reads the owned text without creating separate objects',
    (object, text) => {
      expect(objectText(object)).toBe(text);
    },
  );

  it.each([sticky, rectangle] as DrawingObject[])(
    'updates text immutably and preserves geometry and identity',
    (object) => {
      const before = structuredClone(object);
      const updated = withObjectText(object, 'Replacement\nsecond line');
      expect(updated.id).toBe(object.id);
      expect(objectText(updated)).toBe('Replacement\nsecond line');
      expect(updated).toMatchObject({
        rect: object.type === 'sticky' || object.type === 'rectangle' ? object.rect : undefined,
      });
      expect(object).toEqual(before);
    },
  );

  it('clears a shape note without removing or changing the shape', () => {
    expect(withObjectText(rectangle, '')).toEqual({ ...rectangle, note: '' });
  });
});

describe('bounded, attached note layout', () => {
  it('places a rectangle note above its top edge by default', () => {
    const layout = getNoteLayout(rectangle, bounds);
    expect(layout.center.x).toBe(320);
    expect(layout.rect.y + layout.rect.height).toBe(292);
    expect(layout.fontSize).toBe(20);
    expect(layout.lines).toEqual(['Shape note']);
  });

  it('supports bottom, inside and free placement without a jump', () => {
    const bottom = withLabelPosition(rectangle, 'bottom', bounds);
    expect(getNoteLayout(bottom, bounds).rect.y).toBe(468);
    const inside = withLabelPosition(bottom, 'inside', bounds);
    expect(getNoteLayout(inside, bounds).center).toEqual({ x: 320, y: 380 });
    const free = withLabelPosition(bottom, 'free', bounds);
    expect(getNoteLayout(free, bounds)).toEqual(getNoteLayout(bottom, bounds));
  });

  it('drags notes independently and follows the owner when resized', () => {
    const before = getNoteLayout(rectangle);
    const moved = moveShapeLabelBy(rectangle, { x: 30, y: -20 });
    expect(moved).toMatchObject({ rect: rectangle.rect, labelPosition: 'free' });
    expect(getNoteLayout(moved).center).toEqual({
      x: before.center.x + 30,
      y: before.center.y - 20,
    });
    const resized = { ...moved, rect: { x: 200, y: 300, width: 440, height: 260 } };
    expect(getNoteLayout(resized).center).toEqual({
      x: before.center.x + 130,
      y: before.center.y + 30,
    });
    expect(getNoteLayout(resized).fontSize).toBe(before.fontSize);
    expect(rectangle.labelPosition).toBeUndefined();
  });

  it('moves note layout with its owner without scaling the text', () => {
    const before = getNoteLayout(rectangle);
    const moved = getNoteLayout({
      ...rectangle,
      rect: { x: 240, y: 330, width: 240, height: 160 },
    });
    expect(moved.center).toEqual({ x: before.center.x + 40, y: before.center.y + 30 });
    expect(moved.fontSize).toBe(before.fontSize);
  });

  it('wraps unbroken words and preserves full editable text when visually truncated', () => {
    const text = 'LongUnbrokenLabel'.repeat(40);
    const note = { ...sticky, text };
    const layout = getNoteLayout(note);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.truncated).toBe(true);
    expect(layout.lines.at(-1)).toMatch(/…$/u);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(sticky.rect.height);
    expect(objectText(note)).toBe(text);
  });

  it('preserves explicit paragraph breaks', () => {
    expect(getNoteLayout({ ...sticky, text: 'First\n\nThird' }).lines).toEqual([
      'First',
      '',
      'Third',
    ]);
  });

  it('does not invent text for a legacy shape without a note', () => {
    const layout = getNoteLayout({ ...rectangle, note: undefined });
    expect(layout.lines).toEqual([]);
    expect(layout.truncated).toBe(false);
  });

  it('bounds the note to the visible crop intersection', () => {
    const crop = { x: 260, y: 340, width: 60, height: 50 };
    const layout = getNoteLayout(rectangle, crop);
    expect(layout.rect.x).toBeGreaterThanOrEqual(crop.x);
    expect(layout.rect.y).toBeGreaterThanOrEqual(crop.y);
    expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(crop.x + crop.width);
    expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(crop.y + crop.height);
  });

  it('hides text when no complete line fits without losing the text', () => {
    const note = { ...sticky, rect: { x: 0, y: 0, width: 12, height: 12 } };
    const layout = getNoteLayout(note);
    expect(layout.lines).toEqual([]);
    expect(layout.truncated).toBe(true);
    expect(note.text).toBe(sticky.text);
  });

  it('lays out a long freehand stroke without exceeding the argument stack', () => {
    const points = Array.from({ length: 160_000 }, (_, index) => ({
      x: index % 800,
      y: index % 600,
      pressure: 0.5,
    }));
    const layout = getNoteLayout({
      id: 'long-pen',
      seed: 1,
      style,
      type: 'pen',
      points,
      note: 'Long drawing',
    });
    expect(layout.center).toEqual({ x: 399.5, y: 299.5 });
    expect(layout.lines).toEqual(['Long drawing']);
  });

  it.each([
    [
      {
        id: 'p',
        seed: 1,
        style,
        type: 'pen',
        points: [
          { x: 100, y: 100, pressure: 0.5 },
          { x: 300, y: 200, pressure: 0.5 },
        ],
        note: 'Path',
      },
      { x: 200, y: 150 },
    ],
    [
      {
        id: 'm',
        seed: 1,
        style,
        type: 'magnifier',
        center: { x: 200, y: 150 },
        radius: 60,
        zoom: 2,
        note: 'Lens',
      },
      { x: 200, y: 150 },
    ],
  ] as [DrawingObject, { x: number; y: number }][])(
    'centers non-rectangular shape notes on their owner bounds',
    (object, center) => {
      expect(getNoteLayout(object).center).toEqual(center);
      expect(getNoteLayout(object).lines.length).toBeGreaterThan(0);
    },
  );
});

describe('step notes preserve the numbered circle', () => {
  const step: DrawingObject = {
    id: 'step',
    seed: 1,
    style,
    type: 'step',
    center: { x: 200, y: 150 },
    radius: 24,
    number: 1,
    note: 'Check this step',
  };

  it('preserves leading spaces and the trailing caret line in step notes', () => {
    const layout = getNoteLayout({ ...step, note: ' First \n' }, bounds);
    expect(layout.lines).toEqual([' First ', '']);
    expect(layout.truncated).toBe(false);
    expect(layout.rect.height).toBe(layout.lineHeight * 2);
    expect(layout.contentWidth).toBe(layout.rect.width);
  });

  it('places a tightly attached note below the numbered circle with an eight-pixel gap', () => {
    const layout = getNoteLayout(step, bounds);
    expect(layout.rect.y).toBeGreaterThanOrEqual(step.center.y + step.radius + 8);
    expect(layout.rect.y).toBe(step.center.y + step.radius + 8);
    expect(layout.center.x).toBe(step.center.x);
    expect(layout.rect.height).toBe(layout.lines.length * layout.lineHeight);
    expect(layout.lines).toEqual(['Check this step']);
    expect(step.number).toBe(1);
  });

  it('uses the configured label size for step notes', () => {
    expect(getNoteLayout({ ...step, labelFontSize: 28 }, bounds).fontSize).toBe(28);
  });

  it('preserves wrapping when a step label is dragged into free placement', () => {
    const labeled = { ...step, note: 'A longer step label that wraps onto several lines' };
    const before = getNoteLayout(labeled, bounds);
    const moved = moveShapeLabelBy(labeled, { x: 50, y: 20 }, bounds);
    const after = getNoteLayout(moved, bounds);
    expect(after.lines).toEqual(before.lines);
    expect(after.center).toEqual({ x: before.center.x + 50, y: before.center.y + 20 });
    expect(after.rect.width).toBe(before.rect.width);
  });

  it('bounds long notes to 200 by 100 while retaining the full editable value', () => {
    const note = 'Long step description '.repeat(80);
    const layout = getNoteLayout({ ...step, note }, bounds);
    expect(layout.rect.width).toBeLessThanOrEqual(200);
    expect(layout.rect.height).toBeLessThanOrEqual(100);
    expect(layout.truncated).toBe(true);
    expect(layout.lines.at(-1)).toMatch(/…$/u);
    expect(objectText({ ...step, note })).toBe(note);
  });

  it('clamps an edge label fully into the crop rather than losing the label offscreen', () => {
    const crop = { x: 100, y: 100, width: 140, height: 100 };
    const layout = getNoteLayout({ ...step, center: { x: 225, y: 180 } }, crop);
    expect(layout.lines.length).toBeGreaterThan(0);
    expect(layout.rect.x).toBeGreaterThanOrEqual(crop.x);
    expect(layout.rect.y).toBeGreaterThanOrEqual(crop.y);
    expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(crop.x + crop.width);
    expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(crop.y + crop.height);
  });

  it('places a three-line bottom-edge note above the circle without covering its numeral', () => {
    const object = {
      ...step,
      center: { x: 480, y: 610 },
      radius: 22,
      note: 'First\nSecond\nThird',
    };
    const layout = getNoteLayout(object, { x: 0, y: 0, width: 960, height: 640 });
    expect(layout.lines).toEqual(['First', 'Second', 'Third']);
    expect(layout.truncated).toBe(false);
    expect(layout.rect.y + layout.rect.height).toBe(object.center.y - object.radius - 8);
    expect(layout.rect.y).toBeGreaterThanOrEqual(0);
  });

  it('chooses the clear upper side using a crop with a nonzero origin', () => {
    const crop = { x: 100, y: 200, width: 300, height: 240 };
    const object = {
      ...step,
      center: { x: 380, y: 405 },
      radius: 22,
      note: 'First\nSecond\nThird',
    };
    const layout = getNoteLayout(object, crop);
    expect(layout.lines).toEqual(['First', 'Second', 'Third']);
    expect(layout.rect.y + layout.rect.height).toBe(object.center.y - object.radius - 8);
    expect(layout.rect.x).toBeGreaterThanOrEqual(crop.x);
    expect(layout.rect.x + layout.rect.width).toBeLessThanOrEqual(crop.x + crop.width);
    expect(layout.rect.y).toBeGreaterThanOrEqual(crop.y);
  });

  it.each([
    ['above', 210],
    ['below', 170],
  ] as const)(
    'truncates on the larger clear %s side when neither side fits the full note',
    (side, y) => {
      const crop = { x: 100, y: 100, width: 300, height: 180 };
      const object = {
        ...step,
        center: { x: 250, y },
        radius: 32,
        note: 'First\nSecond\nThird',
      };
      const layout = getNoteLayout(object, crop);
      expect(layout.lines).toHaveLength(2);
      expect(layout.lines.at(-1)).toMatch(/…$/u);
      expect(layout.truncated).toBe(true);
      if (side === 'above') {
        expect(layout.rect.y + layout.rect.height).toBe(object.center.y - object.radius - 8);
      } else {
        expect(layout.rect.y).toBe(object.center.y + object.radius + 8);
      }
      expect(layout.rect.y).toBeGreaterThanOrEqual(crop.y);
      expect(layout.rect.y + layout.rect.height).toBeLessThanOrEqual(crop.y + crop.height);
      expect(objectText(object)).toBe('First\nSecond\nThird');
    },
  );

  it('hides note text rather than painting over a numeral when neither side fits a full line', () => {
    const crop = { x: 100, y: 100, width: 300, height: 80 };
    const object = { ...step, center: { x: 250, y: 140 }, radius: 20, note: 'Important' };
    const layout = getNoteLayout(object, crop);
    expect(layout.lines).toEqual([]);
    expect(layout.truncated).toBe(true);
    expect(layout.rect.height).toBeLessThan(layout.lineHeight);
    expect(objectText(object)).toBe('Important');
  });
});

describe('sticky card creation and resizing', () => {
  it('uses a bounded ellipsis if an indivisible glyph cannot fit even the minimum size', () => {
    const layout = getNoteLayout({
      ...sticky,
      rect: { x: 0, y: 0, width: 80, height: 80 },
      text: '👨‍👩‍👧‍👦',
    });
    expect(layout.fontSize).toBe(8);
    expect(layout.truncated).toBe(true);
    expect(layout.lines).toEqual(['…']);
  });

  it('shrinks oversized individual glyphs to the available inner width', () => {
    const note = { ...sticky, rect: { x: 0, y: 0, width: 42, height: 80 }, text: 'W' };
    const layout = getNoteLayout(note);
    expect(layout.fontSize).toBeLessThan(24);
    expect(layout.truncated).toBe(false);
    expect(measureText(layout.lines[0]!, layout.fontSize)).toBeLessThanOrEqual(layout.rect.width);
  });

  it('retains editable whitespace and trailing blank caret lines during fitting', () => {
    const value = '  First  \n\nSecond\n';
    const layout = getNoteLayout({ ...sticky, text: value });
    expect(layout.lines).toEqual(['  First  ', '', 'Second', '']);
    expect(layout.truncated).toBe(false);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(layout.rect.height);
  });

  it('reuses the fitted text while moving a card, but recomputes for live edits', () => {
    const note = {
      ...sticky,
      text: 'An unchanged sticky whose content needs to shrink to fit'.repeat(2),
    };
    const before = getNoteLayout(note);
    const measure = vi.spyOn(measurements, 'measureText');
    try {
      const moved = getNoteLayout({ ...note, rect: { ...note.rect, x: 400, y: 450 } });
      expect(moved.lines).toEqual(before.lines);
      expect(moved.center).toEqual({ x: 510, y: 525 });
      expect(measure).not.toHaveBeenCalled();
      getNoteLayout({ ...note, text: `${note.text}!` });
      expect(measure).toHaveBeenCalled();
    } finally {
      measure.mockRestore();
    }
  });

  it('shrinks long text to fit the whole card while preserving its preferred size and content', () => {
    const note = {
      ...sticky,
      text: 'This is a longer note that should fit inside the card without losing its ending.',
    };
    const layout = getNoteLayout(note);
    expect(layout.fontSize).toBeLessThan(note.fontSize);
    expect(layout.fontSize).toBeGreaterThanOrEqual(8);
    expect(layout.truncated).toBe(false);
    expect(layout.lines.join('')).toBe(note.text);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(layout.rect.height);
    for (const line of layout.lines)
      expect(measureText(line, layout.fontSize)).toBeLessThanOrEqual(layout.rect.width);
    expect(note.fontSize).toBe(24);
    expect(getNoteLayout({ ...note, text: 'Short again' }).fontSize).toBe(24);
  });

  it('fits preferred text into a smaller cropped card before falling back to truncation', () => {
    const layout = getNoteLayout(
      { ...sticky, text: 'First\nSecond\nThird' },
      { x: 100, y: 100, width: 160, height: 80 },
    );
    expect(layout.truncated).toBe(false);
    expect(layout.lines).toEqual(['First', 'Second', 'Third']);
    expect(layout.fontSize).toBeLessThan(24);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(layout.rect.height);
  });

  it('creates an empty centered colored card with its shadow on by default', () => {
    const result = createSticky({ x: 300, y: 300 }, style, bounds);
    expect(result).toMatchObject({
      type: 'sticky',
      text: '',
      fontSize: 24,
      fontSizing: 'auto',
      rect: { x: 190, y: 225, width: 220, height: 150 },
      style: { ...style, shadow: true },
    });
    expect(result.id).toBeTruthy();
    expect(result.style).not.toBe(style);
    expect(style.shadow).toBeUndefined();
  });

  it('respects a disabled shadow and uses yellow if no color is provided', () => {
    const result = createSticky({ x: 300, y: 300 }, { ...style, color: '', shadow: false }, bounds);
    expect(result.style).toMatchObject({ color: '#ffe58f', shadow: false });
  });

  it('fits the default card to a tiny screenshot and clamps edge placement', () => {
    const tinyBounds = { x: 40, y: 60, width: 100, height: 80 };
    expect(createSticky({ x: 1000, y: -20 }, style, tinyBounds).rect).toEqual(tinyBounds);
  });

  it('freely resizes from a corner and scales text by the smaller dimension ratio', () => {
    const result = resizeSticky(sticky, 'se', { x: 540, y: 550 });
    expect(result.rect).toEqual({ x: 100, y: 100, width: 440, height: 450 });
    expect(result.fontSize).toBe(48);
    expect(result.text).toBe(sticky.text);
    expect(sticky.rect).toEqual({ x: 100, y: 100, width: 220, height: 150 });
    expect(sticky.fontSize).toBe(24);
  });

  it.each([
    ['nw', { x: -120, y: -50 }, { x: -120, y: -50, width: 440, height: 300 }],
    ['ne', { x: 540, y: -50 }, { x: 100, y: -50, width: 440, height: 300 }],
    ['sw', { x: -120, y: 400 }, { x: -120, y: 100, width: 440, height: 300 }],
  ] as const)('keeps the opposite corner fixed when resizing %s', (handle, point, rect) => {
    expect(resizeSticky(sticky, handle, point).rect).toEqual(rect);
  });

  it('clamps minimum card dimensions without flipping at the opposite corner', () => {
    const result = resizeSticky(sticky, 'se', { x: -100, y: -100 });
    expect(result.rect).toEqual({ x: 100, y: 100, width: 80, height: 60 });
    expect(result.fontSize).toBeCloseTo((24 * 80) / 220);
  });

  it('scales manual preferences above 64 pixels but retains a finite safety maximum', () => {
    expect(resizeSticky(sticky, 'se', { x: 2300, y: 1600 }).fontSize).toBe(240);
    expect(resizeSticky(sticky, 'se', { x: 220100, y: 150100 }).fontSize).toBe(2048);
  });
});
