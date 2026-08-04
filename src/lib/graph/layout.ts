import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { GraphEdge, GraphNode } from "./types";

export type LaidOutNode = GraphNode & { x: number; y: number };

const SIMULATION_TICKS = 300;

export const NODE_RADIUS: Record<string, number> = {
  Concept: 26,
  Framework: 24,
  Theme: 22,
  Atom: 16,
};

export function radiusFor(type: string): number {
  return NODE_RADIUS[type] ?? 18;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type SimNode = GraphNode & { x?: number; y?: number };

/**
 * Pure force-directed layout for the Knowledge Map. Every node gets a
 * deterministic starting position (evenly spaced on a circle, by index)
 * before the simulation runs, instead of letting d3-force fall back to its
 * internal Math.random() for missing x/y — that keeps this a pure function
 * of (nodes, edges), safe to call from useMemo during render (SSR and the
 * client hydration render both produce the identical layout, so there's no
 * mismatch and no need to defer the computation into an effect).
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): LaidOutNode[] {
  const radius = Math.min(width, height) / 3;
  const simNodes: SimNode[] = nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    return {
      ...node,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
    };
  });

  const simLinks = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(140)
        .strength(0.25),
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide((d) => radiusFor((d as SimNode).type) + 14),
    )
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) simulation.tick();

  return simNodes.map((node) => ({
    ...node,
    x: clamp(node.x ?? width / 2, 40, width - 40),
    y: clamp(node.y ?? height / 2, 40, height - 40),
  }));
}
