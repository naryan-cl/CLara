import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import type { GraphEdge, GraphNode } from "./types";

export type LaidOutNode = GraphNode & { x: number; y: number };

/** Mutable node used by the live Knowledge Map simulation (pin via fx/fy). */
export type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
};

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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type SeedNode = GraphNode & { x?: number; y?: number };

/**
 * Seed nodes on a circle (deterministic — no Math.random) so SSR/hydration
 * and live sim starts agree on initial placement.
 */
export function seedSimNodes(
  nodes: GraphNode[],
  width: number,
  height: number,
  previous?: Map<string, SimNode>,
): SimNode[] {
  const radius = Math.min(width, height) / 3;
  return nodes.map((node, index) => {
    const prior = previous?.get(node.id);
    if (prior) {
      return {
        ...node,
        x: prior.x,
        y: prior.y,
        vx: prior.vx,
        vy: prior.vy,
        fx: prior.fx,
        fy: prior.fy,
      };
    }
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
    return {
      ...node,
      x: width / 2 + radius * Math.cos(angle),
      y: height / 2 + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    };
  });
}

/**
 * Build a d3-force simulation for the Knowledge Map. Callers own the
 * lifecycle (tick listener, stop on unmount). Pinned nodes keep fx/fy set.
 */
export function createGraphSimulation(
  simNodes: SimNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): Simulation<SimNode, undefined> {
  const simLinks = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));

  return forceSimulation(simNodes)
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
    );
}

/**
 * Pure force-directed layout for the Knowledge Map. Every node gets a
 * deterministic starting position (evenly spaced on a circle, by index)
 * before the simulation runs, instead of letting d3-force fall back to its
 * internal Math.random() for missing x/y — that keeps this a pure function
 * of (nodes, edges), safe to call from useMemo during render (SSR and the
 * first client render both produce the identical layout).
 */
export function computeGraphLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): LaidOutNode[] {
  const simNodes: SeedNode[] = seedSimNodes(nodes, width, height);

  const simLinks = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SeedNode).id)
        .distance(140)
        .strength(0.25),
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide((d) => radiusFor((d as SeedNode).type) + 14),
    )
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) simulation.tick();

  return simNodes.map((node) => ({
    ...node,
    x: clamp(node.x ?? width / 2, 40, width - 40),
    y: clamp(node.y ?? height / 2, 40, height - 40),
  }));
}
