import type { LaidOutNode } from "@/lib/graph/layout";

export type SpatialDirection = "up" | "down" | "left" | "right";

const DIRECTION_VECTOR: Record<SpatialDirection, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Pick the nearest laid-out node in a cardinal direction from `fromId`.
 * Pure helper so keyboard nav is testable without the SVG.
 *
 * Scoring: prefer nodes in the forward half-plane of the arrow, then
 * minimize distance with a light penalty for being off-axis (so "right"
 * prefers a near node to the right over a far node that's slightly up).
 */
export function findNearestInDirection(
  nodes: LaidOutNode[],
  fromId: string,
  direction: SpatialDirection,
): LaidOutNode | null {
  const from = nodes.find((n) => n.id === fromId);
  if (!from || nodes.length < 2) return null;

  const { dx, dy } = DIRECTION_VECTOR[direction];
  let best: LaidOutNode | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.id === fromId) continue;
    const vx = node.x - from.x;
    const vy = node.y - from.y;
    const forward = vx * dx + vy * dy;
    if (forward <= 0) continue;

    const distSq = vx * vx + vy * vy;
    const perp = Math.abs(vx * dy - vy * dx);
    const score = distSq + perp * perp * 2;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

export function directionFromKey(
  key: string,
): SpatialDirection | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
