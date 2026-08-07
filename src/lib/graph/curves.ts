/**
 * Quadratic Bezier helpers for Knowledge Map edges (Festival harvest graph pattern).
 * Bend direction/amount is stable per edge id so curves don't flicker across ticks.
 */

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Trim line endpoints to sit on each node's circumference.
 * Pass radius 0 to run the line through the node center (sprites sit on
 * top of edges, so the connector appears to grow out of the plant).
 */
export function edgeEndpoints(
  sourceX: number,
  sourceY: number,
  sourceRadius: number,
  targetX: number,
  targetY: number,
  targetRadius: number,
) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;

  return {
    x1: sourceX + ux * sourceRadius,
    y1: sourceY + uy * sourceRadius,
    x2: targetX - ux * targetRadius,
    y2: targetY - uy * targetRadius,
  };
}

/** Natural curve between two points; `edgeKey` picks a stable bend. */
export function curvedPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  edgeKey: string,
): string {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const sign = hashString(edgeKey) % 2 === 0 ? 1 : -1;
  const bend = length * (0.12 + (hashString(edgeKey) % 5) * 0.02) * sign;
  const controlX = midX - (dy / length) * bend;
  const controlY = midY + (dx / length) * bend;
  return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
}
