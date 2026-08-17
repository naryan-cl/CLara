import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import type { GraphEdge, GraphNode } from "./types";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  type MapLayoutConfig,
} from "./map-layout-config";
import { closenessRadiiByNodeId } from "./closeness";

export type LaidOutNode = GraphNode & { x: number; y: number };

/** Mutable node used by the live Knowledge Map simulation (pin via fx/fy). */
export type SimNode = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  /** Draw / collide radius — closeness on `/map`, type on the dashboard. */
  radius: number;
};

const SIMULATION_TICKS = 300;

/** @deprecated Prefer radiusFor(type, config) — kept for older call sites. */
export const NODE_RADIUS: Record<string, number> = {
  Concept: DEFAULT_MAP_LAYOUT_CONFIG.radii.Concept,
  Framework: DEFAULT_MAP_LAYOUT_CONFIG.radii.Framework,
  Theme: DEFAULT_MAP_LAYOUT_CONFIG.radii.Theme,
  Atom: DEFAULT_MAP_LAYOUT_CONFIG.radii.Atom,
};

export function radiusFor(
  type: string,
  config: MapLayoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
): number {
  if (type === "Concept" || type === "Chat") return config.radii.Concept;
  if (type === "Framework" || type === "Session") return config.radii.Framework;
  if (type === "Theme" || type === "Record") return config.radii.Theme;
  if (type === "Atom" || type === "Upload") return config.radii.Atom;
  return config.radii.fallback;
}

export function applySimRadii(
  simNodes: SimNode[],
  radiusById: Map<string, number> | null,
  config: MapLayoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
): void {
  for (const node of simNodes) {
    node.radius = radiusById?.get(node.id) ?? radiusFor(node.type, config);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findExistingNeighbor(
  nodeId: string,
  previous: Map<string, SimNode>,
  edges: GraphEdge[],
): SimNode | null {
  for (const edge of edges) {
    if (edge.sourceNodeId === nodeId) {
      const target = previous.get(edge.targetNodeId);
      if (target) return target;
    }
    if (edge.targetNodeId === nodeId) {
      const source = previous.get(edge.sourceNodeId);
      if (source) return source;
    }
  }
  return null;
}

/**
 * Seed nodes on a circle (deterministic — no Math.random) so SSR/hydration
 * and live sim starts agree on initial placement.
 *
 * When a previous layout exists, keep those positions and zero leftover
 * velocity so a click / expand does not fling the whole map. Brand-new
 * nodes spawn next to a connected neighbor when one is already placed.
 */
export function seedSimNodes(
  nodes: GraphNode[],
  width: number,
  height: number,
  previous?: Map<string, SimNode>,
  edges: GraphEdge[] = [],
): SimNode[] {
  const radius = Math.min(width, height) / 3;
  const hadPrevious = Boolean(previous && previous.size > 0);

  return nodes.map((node, index) => {
    const prior = previous?.get(node.id);
    if (prior) {
      return {
        ...node,
        x: prior.x,
        y: prior.y,
        // Drop leftover velocity — otherwise a sim restart keeps spreading.
        vx: 0,
        vy: 0,
        fx: prior.fx,
        fy: prior.fy,
        radius: prior.radius,
      };
    }

    if (hadPrevious && previous) {
      const anchor = findExistingNeighbor(node.id, previous, edges);
      if (anchor) {
        const angle = (index * 2.399963) % (Math.PI * 2);
        const dist = 56;
        return {
          ...node,
          x: anchor.x + dist * Math.cos(angle),
          y: anchor.y + dist * Math.sin(angle),
          vx: 0,
          vy: 0,
          fx: null,
          fy: null,
          radius: radiusFor(node.type),
        };
      }
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
      radius: radiusFor(node.type),
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
  config: MapLayoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
  initialAlpha = 1,
): Simulation<SimNode, undefined> {
  const simLinks = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));

  return forceSimulation(simNodes)
    .alpha(initialAlpha)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(config.linkDistance)
        .strength(config.linkStrength),
    )
    .force("charge", forceManyBody().strength(config.chargeStrength))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide((d) => (d as SimNode).radius + config.collidePadding),
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
  config: MapLayoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
): LaidOutNode[] {
  const simNodes = seedSimNodes(nodes, width, height);
  applySimRadii(simNodes, closenessRadiiByNodeId(nodes, edges, config), config);

  const simLinks = edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => (d as SimNode).id)
        .distance(config.linkDistance)
        .strength(config.linkStrength),
    )
    .force("charge", forceManyBody().strength(config.chargeStrength))
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide((d) => (d as SimNode).radius + config.collidePadding),
    )
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i += 1) simulation.tick();

  return simNodes.map((node) => ({
    ...node,
    x: clamp(node.x ?? width / 2, 40, width - 40),
    y: clamp(node.y ?? height / 2, 40, height - 40),
  }));
}
