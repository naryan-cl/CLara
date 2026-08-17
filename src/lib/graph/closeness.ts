/**
 * Harmonic closeness centrality (social network analysis).
 *
 * Classic Freeman closeness is (n−1) / Σ d(i,j). That breaks when the graph
 * is disconnected — common on a Knowledge Map. Harmonic closeness treats
 * unreachable nodes as 0 (1/∞) so isolates score low and hubs score high:
 *
 *   C(i) = (1 / (n−1)) * Σ_{j≠i} 1 / d(i,j)
 *
 * Edges are treated as undirected: "supports" vs "includes" still means the
 * two ideas sit next to each other in the conversation.
 */

import type { GraphEdge, GraphNode } from "./types";
import type { MapLayoutConfig } from "./map-layout-config";

export const CLOSENESS_GLOSSARY =
  "Closeness (social network analysis) is how few steps it takes to reach other nodes. Larger circles — and higher Top 10 ranks — sit nearer the centre of the conversation.";

function undirectedAdjacency(
  nodes: { id: string }[],
  edges: { sourceNodeId: string; targetNodeId: string }[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const node of nodes) {
    adj.set(node.id, new Set());
  }
  for (const edge of edges) {
    if (edge.sourceNodeId === edge.targetNodeId) continue;
    const from = adj.get(edge.sourceNodeId);
    const to = adj.get(edge.targetNodeId);
    if (!from || !to) continue;
    from.add(edge.targetNodeId);
    to.add(edge.sourceNodeId);
  }
  return adj;
}

function distancesFrom(
  startId: string,
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const dist = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    const depth = dist.get(current) ?? 0;
    for (const next of adj.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, depth + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** Harmonic closeness in [0, 1]. Isolated / singleton graphs score 0. */
export function harmonicClosenessById(
  nodes: { id: string }[],
  edges: { sourceNodeId: string; targetNodeId: string }[],
): Map<string, number> {
  const scores = new Map<string, number>();
  const n = nodes.length;
  if (n === 0) return scores;
  if (n === 1) {
    scores.set(nodes[0]!.id, 0);
    return scores;
  }

  const adj = undirectedAdjacency(nodes, edges);
  const denom = n - 1;
  for (const node of nodes) {
    const dist = distancesFrom(node.id, adj);
    let sum = 0;
    for (const other of nodes) {
      if (other.id === node.id) continue;
      const hops = dist.get(other.id);
      if (hops && hops > 0) sum += 1 / hops;
    }
    scores.set(node.id, sum / denom);
  }
  return scores;
}

/** Best closeness per normalized label (duplicate labels keep the higher score). */
export function closenessByNormalizedLabel(
  nodes: { id: string; label: string }[],
  closenessById: Map<string, number>,
  normalize: (label: string) => string,
): Map<string, number> {
  const byLabel = new Map<string, number>();
  for (const node of nodes) {
    const key = normalize(node.label);
    if (!key) continue;
    const score = closenessById.get(node.id) ?? 0;
    const previous = byLabel.get(key);
    if (previous == null || score > previous) {
      byLabel.set(key, score);
    }
  }
  return byLabel;
}

/**
 * Map a closeness score onto the admin min/max radius knobs.
 * Atom radius = lowest closeness; Concept radius = highest closeness.
 */
export function radiusFromCloseness(
  closeness: number,
  range: { min: number; max: number },
  config: MapLayoutConfig,
): number {
  const minR = config.radii.Atom;
  const maxR = config.radii.Concept;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) {
    return (minR + maxR) / 2;
  }
  const t = Math.min(
    1,
    Math.max(0, (closeness - range.min) / (range.max - range.min)),
  );
  return minR + t * (maxR - minR);
}

function scoreRange(scores: Iterable<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const score of scores) {
    if (score < min) min = score;
    if (score > max) max = score;
  }
  return { min, max };
}

export function closenessRadiiByNodeId(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: MapLayoutConfig,
): Map<string, number> {
  const scores = harmonicClosenessById(nodes, edges);
  const range = scoreRange(scores.values());
  const radii = new Map<string, number>();
  for (const node of nodes) {
    radii.set(
      node.id,
      radiusFromCloseness(scores.get(node.id) ?? 0, range, config),
    );
  }
  return radii;
}
