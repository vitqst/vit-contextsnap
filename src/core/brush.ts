import { getStroke } from 'perfect-freehand';
import type { BrushSettings, PenObject, Point, StrokePoint } from './model';

export const DEFAULT_BRUSH: BrushSettings = { smoothing: 0.6, pressure: 0.45, speed: 0.65 };

function unit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function normalizeBrush(partial?: Partial<BrushSettings>): BrushSettings {
  return {
    smoothing: unit(partial?.smoothing, DEFAULT_BRUSH.smoothing),
    pressure: unit(partial?.pressure, DEFAULT_BRUSH.pressure),
    speed: unit(partial?.speed, DEFAULT_BRUSH.speed),
  };
}

/** Store input pressure before applying settings so a selected stroke stays editable. */
export function sampleStrokePoint(
  point: Point,
  event: { pressure: number; pointerType: string; timeStamp: number },
  previous?: StrokePoint,
  released = false,
): StrokePoint {
  const previousTime = Number.isFinite(previous?.time) ? previous!.time! : 0;
  const time = Number.isFinite(event.timeStamp)
    ? Math.max(previousTime, event.timeStamp)
    : previousTime;
  if (released && previous) {
    return { ...point, time, pressure: previous.pressure, input: previous.input };
  }
  if (event.pointerType === 'pen' && Number.isFinite(event.pressure) && event.pressure > 0) {
    return { ...point, time, pressure: unit(event.pressure, 0.5), input: 'pen' };
  }

  // perfect-freehand's built-in simulation uses spacing rather than elapsed time.
  // Source-pixel velocity keeps our mouse fallback independent of editor zoom.
  let pressure = unit(previous?.pressure, 0.5);
  const elapsed = time - previousTime;
  if (previous && previous.time !== undefined && elapsed > 0) {
    const velocity = Math.hypot(point.x - previous.x, point.y - previous.y) / elapsed;
    pressure = 0.15 + 0.8 / (1 + velocity / 0.75);
  }
  return { ...point, time, pressure, input: 'mouse' };
}

/** Shared by preview and export; never changes the captured points or brush settings. */
export function penOutline(object: PenObject, complete = true): number[][] {
  const brush = normalizeBrush(object.brush);
  return getStroke(
    object.points.map(({ x, y, pressure, input }) => {
      // Missing input is a legacy stored-pressure stroke, not a mouse-speed sample.
      const influence = input === 'mouse' ? brush.speed : brush.pressure;
      return [x, y, 0.5 + (unit(pressure, 0.5) - 0.5) * influence];
    }),
    {
      size: object.style.width * 2,
      thinning: 1,
      smoothing: brush.smoothing,
      streamline: brush.smoothing * 0.75,
      simulatePressure: false,
      last: complete,
    },
  );
}
