import { clamp } from "./layout";

/** Pan (x, y) + scale (k) applied as `translate(x, y) scale(k)` on the map. */
export type ViewTransform = { x: number; y: number; k: number };

export const VIEW_MIN_K = 0.4;
export const VIEW_MAX_K = 2.5;

export type PinchPair = { x1: number; y1: number; x2: number; y2: number };

export function clampZoom(k: number): number {
  return clamp(k, VIEW_MIN_K, VIEW_MAX_K);
}

/**
 * Zoom so the graph point under (screenX, screenY) stays under that pixel.
 * Screen coords are relative to the SVG top-left (same space as view.x / view.y).
 */
export function zoomAroundPoint(
  view: ViewTransform,
  screenX: number,
  screenY: number,
  nextK: number,
): ViewTransform {
  const k = clampZoom(nextK);
  if (view.k === 0) return { ...view, k };
  const factor = k / view.k;
  return {
    k,
    x: screenX - (screenX - view.x) * factor,
    y: screenY - (screenY - view.y) * factor,
  };
}

/** Two-finger pinch: scale around the previous midpoint, then pan with the midpoint. */
export function pinchView(
  view: ViewTransform,
  previous: PinchPair,
  next: PinchPair,
): ViewTransform {
  const prevDist = Math.hypot(
    previous.x2 - previous.x1,
    previous.y2 - previous.y1,
  );
  const nextDist = Math.hypot(next.x2 - next.x1, next.y2 - next.y1);
  const prevMidX = (previous.x1 + previous.x2) / 2;
  const prevMidY = (previous.y1 + previous.y2) / 2;
  const nextMidX = (next.x1 + next.x2) / 2;
  const nextMidY = (next.y1 + next.y2) / 2;
  const scaleFactor = prevDist > 1 ? nextDist / prevDist : 1;
  const zoomed = zoomAroundPoint(view, prevMidX, prevMidY, view.k * scaleFactor);
  return {
    ...zoomed,
    x: zoomed.x + (nextMidX - prevMidX),
    y: zoomed.y + (nextMidY - prevMidY),
  };
}

export function pairFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): PinchPair {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}
