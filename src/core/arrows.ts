import type { ArrowObject, Point } from './model';

/** Preserve old arrows: midpoint controls were straight before mode was explicit. */
export function arrowMode(arrow: ArrowObject): 'straight' | 'curved' {
  return arrow.mode ?? (hasBend(arrow) ? 'curved' : 'straight');
}

/** Straight arrows render on their chord while retaining their editable bend. */
export function arrowControl(arrow: ArrowObject): Point {
  return arrowMode(arrow) === 'straight' ? midpoint(arrow) : arrow.control;
}

export function withArrowMode(arrow: ArrowObject, mode: 'straight' | 'curved'): ArrowObject {
  if (mode === 'straight' || hasBend(arrow)) return { ...arrow, mode };
  const middle = midpoint(arrow);
  return {
    ...arrow,
    mode,
    control: {
      x: middle.x - (arrow.end.y - arrow.start.y) * 0.16,
      y: middle.y + (arrow.end.x - arrow.start.x) * 0.16,
    },
  };
}

function midpoint(arrow: ArrowObject): Point {
  return { x: (arrow.start.x + arrow.end.x) / 2, y: (arrow.start.y + arrow.end.y) / 2 };
}

function hasBend(arrow: ArrowObject): boolean {
  const middle = midpoint(arrow);
  return Math.hypot(arrow.control.x - middle.x, arrow.control.y - middle.y) > 0.00001;
}
