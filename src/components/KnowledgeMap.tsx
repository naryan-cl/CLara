"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { curvedPath, edgeEndpoints } from "@/lib/graph/curves";
import {
  clamp,
  createGraphSimulation,
  radiusFor,
  seedSimNodes,
  type SimNode,
} from "@/lib/graph/layout";
import {
  directionFromKey,
  findNearestInDirection,
} from "@/lib/graph/spatial-nav";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

type ViewTransform = { x: number; y: number; k: number };

const NODE_COLOR: Record<string, string> = {
  Concept: "var(--glow)",
  Framework: "var(--horizon)",
  Theme: "var(--ember)",
  Atom: "var(--sage)",
};

function colorFor(type: string): string {
  return NODE_COLOR[type] ?? "var(--sage)";
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function subscribeMounted(callback: () => void) {
  queueMicrotask(callback);
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getMountedServerSnapshot() {
  return false;
}

/**
 * Knowledge Map canvas (DESIGN_GUIDE.md "Knowledge Map" + Festival harvest
 * patterns): dark forest-deep surface, curved sage edges, scroll-zoom /
 * drag-pan, drag-to-pin nodes with live force adjust for unpinned peers.
 *
 * `hideDetailPanel` + `onSelect` let the dashboard slide detail over Ask CLara
 * without resizing the map column.
 */
export function KnowledgeMap({
  nodes,
  edges,
  selectedId: controlledSelectedId,
  onSelect,
  hideDetailPanel = false,
  className = "",
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | null;
  onSelect?: (node: GraphNode | null) => void;
  hideDetailPanel?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Mutable sim nodes owned by d3-force — only touch in effects / pointer handlers. */
  const nodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<ReturnType<typeof createGraphSimulation> | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
  const dragRef = useRef<{
    type: "pan" | "node";
    id?: string;
    pointerId?: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const nodeDragMovedRef = useRef(false);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  /** Render snapshot — published from the sim ref on each tick / drag. */
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    null,
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isControlled = controlledSelectedId !== undefined;
  const selectedId = isControlled
    ? (controlledSelectedId ?? null)
    : internalSelectedId;

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const hasMounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getMountedServerSnapshot,
  );

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const publishNodes = useCallback(() => {
    setSimNodes(nodesRef.current.slice());
  }, []);

  const selectNode = useCallback(
    (id: string | null) => {
      if (id === null) {
        if (!isControlled) setInternalSelectedId(null);
        onSelect?.(null);
        return;
      }
      const node = nodesRef.current.find((n) => n.id === id) ?? null;
      if (!isControlled) setInternalSelectedId(id);
      setFocusedId(id);
      onSelect?.(node);
    },
    [isControlled, onSelect],
  );

  // Fill the parent: blank space under a fixed 560px canvas was the bug.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.max(280, Math.floor(entry.contentRect.width)),
        height: Math.max(220, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Live force simulation — pinned nodes keep fx/fy; others settle around them.
  // State publishes happen in the tick callback / microtask (external d3 system),
  // not synchronously in the effect body.
  useEffect(() => {
    if (!hasMounted || size.width < 280 || size.height < 220 || nodes.length === 0) {
      nodesRef.current = [];
      queueMicrotask(() => setSimNodes([]));
      return;
    }

    const previous = new Map(nodesRef.current.map((n) => [n.id, n]));
    const seeded = seedSimNodes(nodes, size.width, size.height, previous);
    nodesRef.current = seeded;

    const simulation = createGraphSimulation(
      seeded,
      edges,
      size.width,
      size.height,
    );
    simulation.on("tick", publishNodes);
    simRef.current = simulation;
    queueMicrotask(publishNodes);

    return () => {
      simulation.stop();
      simRef.current = null;
    };
  }, [hasMounted, nodes, edges, size.width, size.height, publishNodes]);

  const nodeById = new Map(simNodes.map((node) => [node.id, node]));
  const selected =
    selectedId != null
      ? (nodeById.get(selectedId) ??
        nodes.find((n) => n.id === selectedId) ??
        null)
      : null;

  useEffect(() => {
    if (!focusedId) return;
    nodeRefs.current.get(focusedId)?.focus();
  }, [focusedId]);

  const clientToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const current = viewRef.current;
      return {
        x: (clientX - rect.left - current.x) / current.k,
        y: (clientY - rect.top - current.y) / current.k,
      };
    },
    [],
  );

  function reheat() {
    const simulation = simRef.current;
    if (!simulation) return;
    simulation.alpha(0.35).restart();
  }

  function findSimNode(id: string): SimNode | undefined {
    return nodesRef.current.find((n) => n.id === id);
  }

  function onNodeKeyDown(
    event: React.KeyboardEvent<SVGGElement>,
    nodeId: string,
  ) {
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      const next = findNearestInDirection(simNodes, nodeId, direction);
      if (next) selectNode(next.id);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode(nodeId);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      selectNode(null);
    }
  }

  const showInternalPanel = !hideDetailPanel && selected != null;
  const activeId = focusedId ?? selectedId ?? simNodes[0]?.id ?? null;
  const ready = hasMounted && size.width > 0 && simNodes.length > 0;

  return (
    <div
      className={`relative flex h-full min-h-[220px] w-full flex-col gap-2 ${className}`.trim()}
    >
      <p className="shrink-0 font-mono text-[11px] text-ink/45">
        Scroll to zoom · drag background to pan · drag a node to pin it ·
        double-click a pin to release · Tab/arrows for keyboard
      </p>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg touch-none"
        style={{ background: "var(--forest-deep)" }}
      >
        {!ready ? (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <p className="font-mono text-xs text-sage">Laying out the map…</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={size.width}
            height={size.height}
            role="img"
            aria-label="Knowledge Map. Scroll to zoom, drag to pan, drag nodes to pin."
            className="block h-full w-full cursor-grab active:cursor-grabbing"
            onWheel={(event) => {
              event.preventDefault();
              const intensity = Math.min(Math.abs(event.deltaY), 100) / 100;
              const step = 0.008 + intensity * 0.01;
              const factor = event.deltaY > 0 ? 1 - step : 1 + step;
              setView((current) => ({
                ...current,
                k: clamp(current.k * factor, 0.4, 2.5),
              }));
            }}
          >
            <rect
              width="100%"
              height="100%"
              fill="var(--forest-deep)"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                dragRef.current = {
                  type: "pan",
                  pointerId: event.pointerId,
                  lastX: event.clientX,
                  lastY: event.clientY,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (
                  dragRef.current?.type !== "pan" ||
                  dragRef.current.pointerId !== event.pointerId
                ) {
                  return;
                }
                const dx = event.clientX - dragRef.current.lastX;
                const dy = event.clientY - dragRef.current.lastY;
                dragRef.current.lastX = event.clientX;
                dragRef.current.lastY = event.clientY;
                setView((current) => ({
                  ...current,
                  x: current.x + dx,
                  y: current.y + dy,
                }));
              }}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId) {
                  dragRef.current = null;
                }
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            />

            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {edges.map((edge) => {
                const source = nodeById.get(edge.sourceNodeId);
                const target = nodeById.get(edge.targetNodeId);
                if (!source || !target) return null;
                const { x1, y1, x2, y2 } = edgeEndpoints(
                  source.x,
                  source.y,
                  radiusFor(source.type),
                  target.x,
                  target.y,
                  radiusFor(target.type),
                );
                const d = curvedPath(x1, y1, x2, y2, edge.id);
                return (
                  <path
                    key={edge.id}
                    d={d}
                    fill="none"
                    stroke="var(--sage)"
                    strokeOpacity={0.45}
                    strokeWidth={1.5}
                    strokeDasharray={reducedMotion ? undefined : "4 6"}
                    style={
                      reducedMotion
                        ? undefined
                        : { animation: "km-edge-flow 3s linear infinite" }
                    }
                  />
                );
              })}

              {simNodes.map((node) => {
                const isSelected = node.id === selectedId;
                const isHovered = node.id === hoveredId;
                const isLit = isSelected || isHovered;
                const isPinned = node.fx != null && node.fy != null;
                const isTabStop = node.id === activeId;
                const r = radiusFor(node.type);
                return (
                  <g
                    key={node.id}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(node.id, el);
                      else nodeRefs.current.delete(node.id);
                    }}
                    tabIndex={isTabStop ? 0 : -1}
                    role="button"
                    aria-label={`${node.type}: ${node.label}${isPinned ? " (pinned)" : ""}`}
                    aria-pressed={isSelected}
                    onFocus={() => setFocusedId(node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      const live = findSimNode(node.id);
                      if (!live) return;
                      if (live.fx != null || live.fy != null) {
                        live.fx = null;
                        live.fy = null;
                        publishNodes();
                        reheat();
                      }
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (event.button !== 0) return;
                      const live = findSimNode(node.id);
                      if (!live) return;
                      const point = clientToGraph(event.clientX, event.clientY);
                      live.fx = point.x;
                      live.fy = point.y;
                      nodeDragMovedRef.current = false;
                      dragRef.current = {
                        type: "node",
                        id: live.id,
                        pointerId: event.pointerId,
                        lastX: event.clientX,
                        lastY: event.clientY,
                      };
                      simRef.current?.alphaTarget(0.25).restart();
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (
                        dragRef.current?.type !== "node" ||
                        dragRef.current.id !== node.id ||
                        dragRef.current.pointerId !== event.pointerId
                      ) {
                        return;
                      }
                      const live = findSimNode(node.id);
                      if (!live) return;
                      const point = clientToGraph(event.clientX, event.clientY);
                      const dx = event.clientX - dragRef.current.lastX;
                      const dy = event.clientY - dragRef.current.lastY;
                      if (Math.hypot(dx, dy) > 4) nodeDragMovedRef.current = true;
                      dragRef.current.lastX = event.clientX;
                      dragRef.current.lastY = event.clientY;
                      live.fx = point.x;
                      live.fy = point.y;
                      live.x = point.x;
                      live.y = point.y;
                      publishNodes();
                    }}
                    onPointerUp={(event) => {
                      if (
                        dragRef.current?.type !== "node" ||
                        dragRef.current.id !== node.id ||
                        dragRef.current.pointerId !== event.pointerId
                      ) {
                        return;
                      }
                      const live = findSimNode(node.id);
                      if (!live) return;
                      const wasClick = !nodeDragMovedRef.current;
                      // Stay pinned after a drag so peers can settle around it.
                      // Pure click selects and does not leave a pin.
                      if (wasClick) {
                        live.fx = null;
                        live.fy = null;
                        selectNode(live.id);
                      } else {
                        live.fx = live.x;
                        live.fy = live.y;
                        reheat();
                      }
                      simRef.current?.alphaTarget(0);
                      dragRef.current = null;
                      event.currentTarget.releasePointerCapture(event.pointerId);
                      publishNodes();
                    }}
                    className="cursor-grab outline-none focus-visible:opacity-90 active:cursor-grabbing"
                    transform={`translate(${node.x}, ${node.y})`}
                  >
                    <circle
                      r={r}
                      fill={colorFor(node.type)}
                      fillOpacity={isLit ? 1 : 0.85}
                      stroke={isPinned ? "var(--paper)" : "transparent"}
                      strokeWidth={isPinned ? 2 : 0}
                      style={
                        isLit && !reducedMotion
                          ? {
                              animation:
                                "glow-pulse var(--duration-ambient) var(--ease) infinite",
                            }
                          : isLit
                            ? {
                                filter:
                                  "drop-shadow(0 0 12px rgba(143,214,196,.6))",
                              }
                            : undefined
                      }
                    />
                    <text
                      y={r + 16}
                      textAnchor="middle"
                      className="fill-paper font-mono text-[10px] select-none"
                      style={{ pointerEvents: "none" }}
                    >
                      {node.label.length > 22
                        ? `${node.label.slice(0, 21)}…`
                        : node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {showInternalPanel && selected ? (
          <NodeDetailPanel
            node={selected}
            onClose={() => selectNode(null)}
            className="absolute inset-y-3 right-3 z-10 w-[min(100%-1.5rem,18rem)] shadow-lg"
          />
        ) : null}
      </div>
    </div>
  );
}
