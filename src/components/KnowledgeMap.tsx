"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MapWallpaper } from "@/components/map/MapWallpaper";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { curvedPath, edgeEndpoints } from "@/lib/graph/curves";
import {
  clamp,
  createGraphSimulation,
  radiusFor,
  seedSimNodes,
  type SimNode,
} from "@/lib/graph/layout";
import { nodeSpriteUrl, spriteSizeFor } from "@/lib/graph/node-sprite";
import {
  directionFromKey,
  findNearestInDirection,
} from "@/lib/graph/spatial-nav";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { paletteFor, type MapThemeId } from "@/lib/map-theme";

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
 * patterns): curved edges, scroll-zoom / drag-pan, drag-to-pin nodes with
 * live force adjust for unpinned peers.
 *
 * Optional `wallpaperTheme` (Phase 7): generative topo under the graph that
 * pans/zooms with nodes. Contrast tokens come from the theme palette.
 * Nodes render as nature sprites when `/public/map-sprites` is present
 * (circles are the fallback). Omit wallpaper theme for classic dark canvas.
 *
 * `hideDetailPanel` + `onSelect` let the dashboard open detail inside Ask
 * without resizing the map. `hideChrome` drops the hint row for full-bleed.
 */
export function KnowledgeMap({
  nodes,
  edges,
  selectedId: controlledSelectedId,
  onSelect,
  hideDetailPanel = false,
  hideChrome = false,
  wallpaperTheme = null,
  wallpaperSeed,
  className = "",
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string | null;
  onSelect?: (node: GraphNode | null) => void;
  hideDetailPanel?: boolean;
  /** Dashboard full-bleed: no hint row, square canvas edge. */
  hideChrome?: boolean;
  /** Generative topo wallpaper (Plant/Ocean/Desert). Null = dark classic. */
  wallpaperTheme?: MapThemeId | null;
  /** Seed for generative terrain (stable per stream is ideal). */
  wallpaperSeed?: string;
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

  const themePalette = wallpaperTheme ? paletteFor(wallpaperTheme) : null;
  const canvasFill = themePalette?.base ?? "var(--forest-deep)";

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

  const edgeStroke = themePalette?.edgeStroke ?? "var(--sage)";
  const edgeOpacity = themePalette?.edgeOpacity ?? 0.45;
  const labelFill = themePalette?.labelFill ?? "var(--paper)";
  const nodeStrokeDefault = themePalette?.nodeStroke ?? "transparent";
  const pinnedStroke = themePalette?.pinnedStroke ?? "var(--paper)";

  return (
    <div
      className={`relative flex h-full min-h-[220px] w-full flex-col ${hideChrome ? "gap-0" : "gap-2"} ${className}`.trim()}
    >
      {hideChrome ? null : (
        <p className="shrink-0 font-mono text-[11px] text-ink/45">
          Scroll to zoom · drag background to pan · drag a node to pin it ·
          double-click a pin to release · Tab/arrows for keyboard
        </p>
      )}

      <div
        ref={containerRef}
        className={`relative min-h-0 flex-1 overflow-hidden touch-none ${hideChrome ? "" : "rounded-lg"}`}
        style={{ background: canvasFill }}
      >
        {!ready ? (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <p
              className={`font-mono text-xs ${themePalette ? "" : "text-sage"}`}
              style={themePalette ? { color: labelFill } : undefined}
            >
              Laying out the map…
            </p>
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
            {/* Hit target uses theme base; wallpaper lives inside the transform. */}
            <rect
              width="100%"
              height="100%"
              fill={canvasFill}
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
              {wallpaperTheme ? (
                <MapWallpaper
                  theme={wallpaperTheme}
                  viewportWidth={size.width}
                  viewportHeight={size.height}
                  seed={wallpaperSeed}
                  reducedMotion={reducedMotion}
                />
              ) : null}

              {edges.map((edge) => {
                const source = nodeById.get(edge.sourceNodeId);
                const target = nodeById.get(edge.targetNodeId);
                if (!source || !target) return null;
                // Radius 0 → edges run through sprite centers (icons sit on top).
                const { x1, y1, x2, y2 } = edgeEndpoints(
                  source.x,
                  source.y,
                  0,
                  target.x,
                  target.y,
                  0,
                );
                const d = curvedPath(x1, y1, x2, y2, edge.id);
                return (
                  <path
                    key={edge.id}
                    d={d}
                    fill="none"
                    stroke={edgeStroke}
                    strokeOpacity={edgeOpacity}
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
                const spriteHref = nodeSpriteUrl(node.type, node.id);
                const spriteSize = spriteSizeFor(r);
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
                    {spriteHref ? (
                      <image
                        href={spriteHref}
                        x={-spriteSize / 2}
                        y={-spriteSize / 2}
                        width={spriteSize}
                        height={spriteSize}
                        style={
                          isLit && !reducedMotion
                            ? {
                                pointerEvents: "none",
                                animation:
                                  "glow-pulse var(--duration-ambient) var(--ease) infinite",
                                filter:
                                  "drop-shadow(0 0 10px rgba(143,214,196,.55))",
                              }
                            : isLit
                              ? {
                                  pointerEvents: "none",
                                  filter:
                                    "drop-shadow(0 0 10px rgba(143,214,196,.55))",
                                }
                              : { pointerEvents: "none" }
                        }
                      />
                    ) : (
                      <circle
                        r={r}
                        fill={colorFor(node.type)}
                        fillOpacity={isLit ? 1 : 0.85}
                        stroke={isPinned ? pinnedStroke : nodeStrokeDefault}
                        strokeWidth={isPinned ? 2 : themePalette ? 1 : 0}
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
                    )}
                    {/* Invisible hit target — sprites are irregular shapes. */}
                    <circle r={r} fill="transparent" />
                    {isPinned ? (
                      <circle
                        r={r + 4}
                        fill="none"
                        stroke={pinnedStroke}
                        strokeWidth={2}
                        style={{ pointerEvents: "none" }}
                      />
                    ) : null}
                    <text
                      y={r + 18}
                      textAnchor="middle"
                      className={`font-display text-[11px] font-medium select-none ${themePalette ? "" : "fill-paper"}`}
                      fill={themePalette ? labelFill : undefined}
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
