import { describe, expect, it, vi } from 'vitest';
import type { TextObject } from './model';
import { measureText } from './label-layout';
import * as measurements from './label-layout';
import { objectBounds, hitTestObject } from './geometry';
import { documentBounds } from './document-bounds';
import {
  DEFAULT_TEXT_WIDTH,
  MIN_TEXT_WIDTH,
  TEXT_CARD_PADDING,
  TEXT_CARD_RADIUS,
  getTextCardRect,
  getTextLayout,
  hitTestTextHandle,
  resizeTextWidth,
  textHandles,
} from './text-layout';

const text: TextObject & { width: number } = {
  id: 'text',
  type: 'text',
  seed: 1,
  style: { color: '#e05252', width: 4, sketch: false, shadow: false },
  position: { x: 100, y: 120 },
  fontSize: 24,
  text: 'Hello world',
  width: 100,
};

describe('resizable plain text layout', () => {
  it('uses a fixed measured width with unlimited wrapped height', () => {
    const value = 'A helpful message that should wrap naturally across many lines. '.repeat(20);
    const layout = getTextLayout({ ...text, text: value });
    expect(DEFAULT_TEXT_WIDTH).toBe(220);
    expect(layout.rect).toMatchObject({ ...text.position, width: 100 });
    expect(layout.lines.length).toBeGreaterThan(8);
    expect(layout.lineHeight).toBe(Math.ceil(text.fontSize * 1.3));
    expect(layout.rect.height).toBe(layout.lines.length * layout.lineHeight);
    expect(layout.lines.join('')).toBe(value);
    for (const line of layout.lines)
      expect(measureText(line, layout.fontSize)).toBeLessThanOrEqual(100);
    expect(layout.lines.some((line) => line.includes('…'))).toBe(false);
  });

  it('retains whitespace, blank paragraphs, and a final empty caret line', () => {
    const layout = getTextLayout({ ...text, width: 220, text: '  First  line\n\nSecond\n' });
    expect(layout.lines).toEqual(['  First  line', '', 'Second', '']);
    expect(layout.rect.height).toBe(4 * layout.lineHeight);
    expect(getTextLayout({ ...text, text: '' }).lines).toEqual(['']);
    expect(getTextLayout({ ...text, text: '' }).rect.height).toBe(layout.lineHeight);
  });

  it('wraps long tokens without splitting emoji or combining marks', () => {
    const value = 'a\u0301'.repeat(20);
    const layout = getTextLayout({ ...text, width: 50, text: value });
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.join('')).toBe(value);
    expect(layout.lines.every((line) => !line.startsWith('\u0301'))).toBe(true);
    const family = '👨‍👩‍👧‍👦';
    const emoji = getTextLayout({ ...text, width: 50, text: family.repeat(3) });
    expect(emoji.lines).toEqual([family, family, family]);
    expect(emoji.rect.width).toBe(50);
    expect(objectBounds({ ...text, width: 50, text: family }).width).toBeGreaterThanOrEqual(
      measureText(family, 24),
    );
    const indented = getTextLayout({ ...text, text: ` ${'W'.repeat(30)}` });
    expect(indented.lines.join('')).toBe(` ${'W'.repeat(30)}`);
    for (const line of indented.lines) expect(measureText(line, 24)).toBeLessThanOrEqual(100);
  });

  it('reuses metrics during translation while changed width and content recompute layout', () => {
    const object = { ...text, text: 'An unchanged annotation with enough words to wrap' };
    getTextLayout(object);
    const measure = vi.spyOn(measurements, 'measureText');
    try {
      const moved = getTextLayout({ ...object, position: { x: 500, y: 600 } });
      expect(moved.rect).toMatchObject({ x: 500, y: 600 });
      expect(measure).not.toHaveBeenCalled();
      getTextLayout({ ...object, width: 150 });
      expect(measure).toHaveBeenCalled();
      measure.mockClear();
      getTextLayout({ ...object, text: `${object.text}!` });
      expect(measure).toHaveBeenCalled();
    } finally {
      measure.mockRestore();
    }
  });

  it('keeps legacy auto-width objects unwrapped and measures wide glyphs', () => {
    const layout = getTextLayout({ ...text, width: undefined, text: 'WWWW\nlonger line' });
    expect(layout.lines).toEqual(['WWWW', 'longer line']);
    expect(layout.rect.width).toBe(
      Math.max(measureText('WWWW', 24), measureText('longer line', 24)),
    );
  });

  it('shares wrapped text bounds between selection, hit testing, and expanded export', () => {
    const object = { ...text, position: { x: -50, y: 20 }, text: 'Expanded text '.repeat(30) };
    const layout = getTextLayout(object);
    expect(objectBounds(object)).toEqual(layout.rect);
    expect(hitTestObject(object, { x: -25, y: layout.rect.y + layout.rect.height - 5 })).toBe(true);
    const bounds = documentBounds(200, 200, [object]);
    expect(bounds.y + bounds.height).toBeGreaterThan(layout.rect.y + layout.rect.height);
    expect(bounds.width).toBeLessThan(300);
  });
});

describe('text width handles', () => {
  it('places and hit-tests left/right handles at the middle of the text box', () => {
    const layout = getTextLayout(text);
    expect(textHandles(text)).toEqual({
      w: { x: 100, y: 120 + layout.rect.height / 2 },
      e: { x: 200, y: 120 + layout.rect.height / 2 },
    });
    expect(hitTestTextHandle(text, textHandles(text).e, 11)).toBe('e');
    expect(hitTestTextHandle(text, { x: 150, y: 120 + layout.rect.height / 2 }, 100)).toBeNull();
  });

  it('keeps the opposite edge and font size while width changes reflow height', () => {
    const longer = { ...text, text: 'One two three four five six seven eight nine' };
    const wider = resizeTextWidth(longer, 'e', { x: 300, y: 800 });
    expect(wider).toMatchObject({ position: text.position, width: 200, fontSize: 24 });
    expect(getTextLayout(wider).rect.height).toBeLessThan(getTextLayout(longer).rect.height);
    const left = resizeTextWidth(longer, 'w', { x: 60, y: 800 });
    expect(left).toMatchObject({ position: { x: 60, y: 120 }, width: 140, fontSize: 24 });
    expect(text.width).toBe(100);
  });

  it('clamps crossing handles to a usable width without flipping the anchor', () => {
    expect(resizeTextWidth(text, 'e', { x: -500, y: 0 })).toMatchObject({
      position: text.position,
      width: MIN_TEXT_WIDTH,
    });
    expect(resizeTextWidth(text, 'w', { x: 500, y: 0 })).toMatchObject({
      position: { x: 200 - MIN_TEXT_WIDTH, y: 120 },
      width: MIN_TEXT_WIDTH,
    });
  });
});

describe('optional text background cards', () => {
  const card: TextObject = {
    ...text,
    background: { enabled: true, color: '#ffe58f' },
  };

  it('adds twelve-pixel padding without changing text position, wrapping or font metrics', () => {
    expect(TEXT_CARD_PADDING).toBe(12);
    expect(TEXT_CARD_RADIUS).toBe(6);
    const layout = getTextLayout(card);
    expect(layout).toEqual(getTextLayout(text));
    expect(getTextCardRect(card, layout)).toEqual({
      x: 88,
      y: 108,
      width: 124,
      height: layout.rect.height + 24,
    });
  });

  it('includes card padding in hit testing and restores plain bounds when disabled', () => {
    const layout = getTextLayout(card);
    expect(objectBounds(card)).toEqual({
      x: 88,
      y: 108,
      width: 124,
      height: layout.rect.height + 24,
    });
    expect(hitTestObject(card, { x: 90, y: 120 }, 0)).toBe(true);
    expect(hitTestObject(text, { x: 90, y: 120 }, 0)).toBe(false);
    const disabled = { ...card, background: { ...card.background!, enabled: false } };
    expect(objectBounds(disabled)).toEqual(objectBounds(text));
    expect(getTextCardRect(disabled)).toBeNull();
    expect(getTextCardRect(text)).toBeNull();
  });

  it('grows the card height with text and covers indivisible glyphs wider than the wrapping box', () => {
    const family = '👨‍👩‍👧‍👦';
    const narrow = { ...card, width: 40, text: family };
    const layout = getTextLayout(narrow);
    expect(objectBounds(narrow).width).toBe(layout.inkWidth + 24);
    const longer = { ...card, text: 'More wrapped text '.repeat(10) };
    expect(objectBounds(longer).height).toBe(getTextLayout(longer).rect.height + 24);
    expect(objectBounds(longer).height).toBeGreaterThan(objectBounds(card).height);
    expect(card.width).toBe(100);
    expect(card.position).toEqual(text.position);
  });

  it('reuses text metrics when the card is toggled, recolored or translated', () => {
    const original = { ...text, text: 'Cache-independent background card' };
    const metrics = getTextLayout(original);
    const measure = vi.spyOn(measurements, 'measureText');
    try {
      const enabled = { ...original, background: card.background };
      expect(getTextLayout(enabled)).toEqual(metrics);
      const recolored: TextObject = {
        ...enabled,
        background: { enabled: true, color: '#ffffff' },
      };
      getTextLayout(recolored);
      getTextLayout({ ...enabled, position: { x: -500, y: 600 } });
      expect(measure).not.toHaveBeenCalled();
    } finally {
      measure.mockRestore();
    }
  });

  it('puts width handles on the card edges and resizes without moving the opposite edge', () => {
    const y = text.position.y + getTextLayout(card).rect.height / 2;
    expect(textHandles(card)).toEqual({ w: { x: 88, y }, e: { x: 212, y } });
    const wider = resizeTextWidth(card, 'e', { x: 312, y });
    expect(wider).toMatchObject({ position: text.position, width: 200, fontSize: 24 });
    expect(objectBounds(wider).x).toBe(88);
    expect(objectBounds(wider).x + objectBounds(wider).width).toBe(312);
    const left = resizeTextWidth(card, 'w', { x: 48, y });
    expect(left).toMatchObject({ position: { x: 60, y: 120 }, width: 140, fontSize: 24 });
    expect(objectBounds(left).x).toBe(48);
    expect(objectBounds(left).x + objectBounds(left).width).toBe(212);
    expect(hitTestTextHandle(card, { x: 88, y }, 5)).toBe('w');
  });

  it('keeps the opposite card edge fixed at minimum width, even for overflowing graphemes', () => {
    const narrowed = resizeTextWidth(card, 'w', { x: 500, y: 0 });
    expect(narrowed.width).toBe(MIN_TEXT_WIDTH);
    expect(narrowed.position.x).toBe(160);
    expect(objectBounds(narrowed).x + objectBounds(narrowed).width).toBe(212);
    const emoji = { ...card, width: 40, text: '👨‍👩‍👧‍👦' };
    const before = objectBounds(emoji);
    const after = resizeTextWidth(emoji, 'w', { x: 500, y: 0 });
    expect(objectBounds(after).x + objectBounds(after).width).toBe(before.x + before.width);
    expect(resizeTextWidth(emoji, 'e', textHandles(emoji).e)).toBe(emoji);
    expect(resizeTextWidth(emoji, 'w', textHandles(emoji).w)).toBe(emoji);
  });
});
