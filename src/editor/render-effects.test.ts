import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawingObject } from '../core/model';
import { blurSampleBounds, getEffectSource, magnifierSourceRect } from './render-effects';

describe('effect source sampling', () => {
  it('maps a 2x circular lens to screenshot coordinates independently of output crop', () => {
    const source = magnifierSourceRect({ x: 330, y: 280 }, 72, 2);
    expect(source).toEqual({ x: 294, y: 244, width: 72, height: 72 });
    // Destination x=388 samples x=359: a pixel outside the original blue block becomes blue.
    expect(source.x + ((388 - (330 - 72)) / 144) * source.width).toBe(359);
  });

  it('retains off-image lens coordinates so clipping does not stretch edge pixels', () => {
    expect(magnifierSourceRect({ x: 10, y: 10 }, 60, 2)).toEqual({
      x: -20,
      y: -20,
      width: 60,
      height: 60,
    });
  });

  it('includes neighboring source pixels for Gaussian blur but bounds temporary patches', () => {
    expect(
      blurSampleBounds({ x: 200, y: 180, width: 200, height: 200 }, 12, {
        width: 960,
        height: 640,
      }),
    ).toEqual({ x: 164, y: 144, width: 272, height: 272 });
    expect(
      blurSampleBounds({ x: 0, y: 0, width: 50, height: 50 }, 32, { width: 960, height: 640 }),
    ).toEqual({ x: 0, y: 0, width: 146, height: 146 });
  });

  it('does not allocate a patch for an effect completely outside the screenshot', () => {
    expect(
      blurSampleBounds({ x: 2000, y: 2000, width: 100, height: 100 }, 12, {
        width: 960,
        height: 640,
      }),
    ).toEqual({ x: 960, y: 640, width: 0, height: 0 });
  });
});

describe('blur renderer compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());

  const objects: DrawingObject[] = [
    {
      id: 'blur',
      type: 'blur',
      rect: { x: 0, y: 0, width: 7, height: 7 },
      strength: 4,
      seed: 1,
      style: { color: '#000000', width: 1, sketch: false, shadow: false },
    },
    {
      id: 'redaction',
      type: 'redact',
      rect: { x: 1.5, y: 1.5, width: 2, height: 2 },
      seed: 2,
      style: { color: '#000000', width: 1, sketch: false, shadow: false },
    },
  ];

  // Canvas is unavailable in the node test runtime. Record browser boundary calls while
  // passing real pixel arrays through the fallback, including the ordering of masks.
  function canvasEnvironment(nativeFilter: boolean, unreadable = false) {
    const events: string[] = [];
    const contexts: ReturnType<typeof makeContext>[] = [];
    const canvases: HTMLCanvasElement[] = [];
    function makeContext() {
      const context = {
        fillStyle: '',
        ...(nativeFilter ? { filter: 'none' } : {}),
        save() {},
        restore() {},
        beginPath() {},
        rect() {},
        clip() {},
        clearRect() {},
        resetTransform() {},
        translate() {},
        fillRect: vi.fn(() => events.push(`fill:${context.fillStyle}`)),
        drawImage: vi.fn(() => events.push(`draw:${context.filter ?? 'unsupported'}`)),
        getImageData: vi.fn((_x: number, _y: number, width = 7, height = 7) => {
          events.push('read');
          if (unreadable) throw new Error('Pixel read failed');
          const data = new Uint8ClampedArray(width * height * 4);
          for (let i = 3; i < data.length; i += 4) data[i] = 255;
          data[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4] = 255;
          return { width, height, data };
        }),
        putImageData: vi.fn((pixels: { data: Uint8ClampedArray }) => {
          events.push('write');
          return pixels;
        }),
      };
      return context;
    }
    vi.stubGlobal('document', {
      createElement: () => {
        const context = makeContext();
        contexts.push(context);
        const canvas = { width: 7, height: 7, getContext: () => context };
        canvases.push(canvas as unknown as HTMLCanvasElement);
        return canvas;
      },
    });
    return {
      events,
      contexts,
      canvases,
      failReads() {
        unreadable = true;
      },
    };
  }

  it('uses pixel blur when filters are missing, with redactions before sampling and after drawing', () => {
    const { events, contexts, canvases } = canvasEnvironment(false);
    const source = { width: 7, height: 7 } as CanvasImageSource;
    const result = getEffectSource(source, objects);

    expect(contexts[1]!.putImageData).toHaveBeenCalledOnce();
    const blurred = contexts[1]!.putImageData.mock.calls[0]![0].data;
    expect(blurred[(3 * 7 + 3) * 4]).toBeLessThan(255);
    expect(events.indexOf('fill:#000000')).toBeLessThan(events.indexOf('read'));
    expect(events.indexOf('write')).toBeLessThan(events.indexOf('fill:#ffffff'));
    expect(events.at(-1)).toBe('fill:#000000');
    expect(contexts[0]!.fillRect).toHaveBeenCalledWith(1, 1, 3, 3);
    expect(result).toBe(canvases[0]);
    expect(result).not.toBe(source);
  });

  it('keeps native canvas blur when supported without reading pixels into JavaScript', () => {
    const { events, contexts } = canvasEnvironment(true);
    getEffectSource({ width: 7, height: 7 } as CanvasImageSource, objects);
    expect(contexts[1]!.getImageData).not.toHaveBeenCalled();
    expect(contexts[1]!.putImageData).not.toHaveBeenCalled();
    expect(events).toContain('draw:blur(4px)');
  });

  it('sanitizes standalone redactions before fractional preview resampling', () => {
    const { contexts } = canvasEnvironment(true);
    const source = { width: 7, height: 7 } as CanvasImageSource;
    expect(getEffectSource(source, [objects[1]!])).not.toBe(source);
    expect(contexts[0]!.fillRect).toHaveBeenCalledWith(1, 1, 3, 3);
  });

  it('does not rerasterize image effects when an ordinary annotation expands the document', () => {
    const { contexts, canvases } = canvasEnvironment(true);
    const source = { width: 7, height: 7 } as CanvasImageSource;
    const arrow: DrawingObject = {
      id: 'arrow',
      type: 'arrow',
      start: { x: 1, y: 1 },
      end: { x: 5, y: 5 },
      control: { x: 3, y: 3 },
      mode: 'straight',
      label: '',
      labelOffset: { x: 0, y: 0 },
      seed: 3,
      style: { color: '#ff0000', width: 1, sketch: false, shadow: false },
    };
    getEffectSource(source, [...objects, arrow]);
    const dimensions = { width: canvases[0]!.width, height: canvases[0]!.height };
    const draws = contexts[0]!.drawImage.mock.calls.length;

    getEffectSource(source, [
      ...objects,
      { ...arrow, start: { x: -500, y: -500 }, end: { x: -450, y: -450 } },
    ]);

    expect({ width: canvases[0]!.width, height: canvases[0]!.height }).toEqual(dimensions);
    expect(contexts[0]!.drawImage).toHaveBeenCalledTimes(draws);
    expect(canvases).toHaveLength(2); // source + the original blur patch only
  });

  it('fails export instead of returning an unblurred image when fallback pixels cannot be read', () => {
    canvasEnvironment(false, true);
    expect(() => getEffectSource({ width: 7, height: 7 } as CanvasImageSource, objects)).toThrow(
      'Pixel read failed',
    );
  });

  it('does not reuse a partially rendered cached source after a pixel read failure', () => {
    const { failReads } = canvasEnvironment(false);
    const source = { width: 7, height: 7 } as CanvasImageSource;
    getEffectSource(source, objects);
    failReads();
    const changed = objects.map((object) =>
      object.type === 'blur' ? { ...object, strength: 8 } : object,
    );
    expect(() => getEffectSource(source, changed)).toThrow('Pixel read failed');
    expect(() => getEffectSource(source, objects)).toThrow('Pixel read failed');
  });

  it('does not allocate an oversized intermediate canvas when a cached surface changes aspect ratio', () => {
    const { canvases } = canvasEnvironment(true);
    const source = { width: 100, height: 100 } as CanvasImageSource;
    getEffectSource(source, [objects[1]!], undefined, { x: 0, y: 0, width: 1000, height: 15000 });
    const canvas = canvases[0]!;
    let width = canvas.width;
    let height = canvas.height;
    let maximumPixels = width * height;
    Object.defineProperties(canvas, {
      width: {
        get: () => width,
        set: (value: number) => {
          width = value;
          maximumPixels = Math.max(maximumPixels, width * height);
        },
      },
      height: {
        get: () => height,
        set: (value: number) => {
          height = value;
          maximumPixels = Math.max(maximumPixels, width * height);
        },
      },
    });
    getEffectSource(source, [objects[1]!], undefined, { x: 0, y: 0, width: 15000, height: 1000 });
    expect(maximumPixels).toBeLessThanOrEqual(32_000_000);
  });

  it('bounds preview fallback readback to a reduced patch after applying redactions', () => {
    const { contexts, events } = canvasEnvironment(false);
    const source = { width: 960, height: 640 } as CanvasImageSource;
    const large = [
      { ...objects[0]!, rect: { x: 200, y: 180, width: 600, height: 400 }, strength: 12 },
      objects[1]!,
    ] as DrawingObject[];
    getEffectSource(source, large, undefined, undefined, { previewEffects: true });
    expect(contexts[1]!.getImageData).toHaveBeenCalledWith(0, 0, 168, 118);
    expect(events.indexOf('fill:#000000')).toBeLessThan(events.indexOf('read'));
  });

  it('never reuses approximate preview pixels for full-resolution export', () => {
    const { contexts } = canvasEnvironment(false);
    const source = { width: 960, height: 640 } as CanvasImageSource;
    const large = [
      { ...objects[0]!, rect: { x: 200, y: 180, width: 600, height: 400 }, strength: 12 },
    ] as DrawingObject[];
    getEffectSource(source, large, undefined, undefined, { previewEffects: true });
    getEffectSource(source, large);
    const dimensions = contexts.flatMap((context) =>
      context.getImageData.mock.calls.map((call) => call.slice(2)),
    );
    expect(dimensions).toEqual([
      [168, 118],
      [672, 472],
    ]);
  });
});
