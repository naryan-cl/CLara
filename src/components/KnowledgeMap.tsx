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
  createGraphSimulation,
  radiusFor,
  seedSimNodes,
  type SimNode,
} from "@/lib/graph/layout";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  type MapLayoutConfig,
} from "@/lib/graph/map-layout-config";
import { nodeSpriteUrl, spriteSizeFor } from "@/lib/graph/node-sprite";
import {
  directionFromKey,
  findNearestInDirection,
} from "@/lib/graph/spatial-nav";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import {
  pairFromPoints,
  pinchView,
  zoomAroundPoint,
  type PinchPair,
  type ViewTransform,
} from "@/lib/graph/view-transform";
import { paletteFor, type MapThemeId } from "@/lib/map-theme";

type PointerPos = { x: number; y: number; clientX: number; clientY: number };
type PanGesture = {
  pointerId: number;
  lastX: number;
  lastY: number;
  /** False until the finger/mouse has moved — lets a touch still count as a tap. */
  armed: boolean;
};
type TouchTap = {
  nodeId: string;
  pointerId: number;
  x: number;
  y: number;
};

const TAP_MAX_PX = 8;
const PAN_START_PX = 4;

function isMapNodeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-km-node]"));
}

function nodeIdFromTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-km-node]")?.getAttribute("data-km-node") ?? null;
}

const NODE_COLOR: Record<string, string> = {
  Concept: "var(--glow)",
  Framework: "var(--horizon)",
  Theme: "var(--ember)",
  Atom: "var(--sage)",
  // Dashboard Commons contribution types (IA v2)
  Session: "var(--horizon)",
  Chat: "var(--glow)",
  Record: "var(--ember)",
  Upload: "var(--sage)",
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
 * patterns): curved edges, scroll-zoom / pinch-zoom, one-finger or drag pan,
 * drag-to-pin nodes with live force adjust for unpinned peers. Touch: pinch
 * zooms, one finger pans (tap a node to select). Mouse: wheel zoom, drag pan,
 * drag a node to pin.
 *
 * Optional `wallpaperTheme` (Phase 7): generative topo under the graph that
 * pans/zooms with nodes. Contrast tokens come from the theme palette.
 * Dashboard passes `useSprites` so nodes use theme nature icons; `/map`
 * leaves both off for classic dark circles.
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
  useSprites = false,
  layoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
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
  /** Theme sprite icons (dashboard). False = type-colored circles (`/map`). */
  useSprites?: boolean;
  /** Stream (or live admin preview) force + size knobs. */
  layoutConfig?: MapLayoutConfig;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Mutable sim nodes owned by d3-force — only touch in effects / pointer handlers. */
  const nodesRef = useRef<SimNode[]>([]);
  const simRef = useRef<ReturnType<typeof createGraphSimulation> | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const nodeDragMovedRef = useRef(false);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  const pointersRef = useRef(new Map<number, PointerPos>());
  const pinchRef = useRef<{ last: PinchPair } | null>(null);
  const panRef = useRef<PanGesture | null>(null);
  const touchTapRef = useRef<TouchTap | null>(null);

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

  const layoutConfigKey = JSON.stringify(layoutConfig);
  // Identity of who is on the canvas — not labels. Title/status tweaks must
  // not restart physics or every click/poll shoves the map apart.
  const topologyKey = `${nodes.map((n) => n.id).join("|")}::${edges.map((e) => e.id).join("|")}`;

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
    const seeded = seedSimNodes(
      nodes,
      size.width,
      size.height,
      previous,
      edges,
    );
    nodesRef.current = seeded;

    const simulation = createGraphSimulation(
      seeded,
      edges,
      size.width,
      size.height,
      layoutConfig,
      previous.size > 0 ? 0.08 : 1,
    );
    simulation.on("tick", publishNodes);
    simRef.current = simulation;
    queueMicrotask(publishNodes);

    return () => {
      simulation.stop();
      simRef.current = null;
    };
    // layoutConfigKey encodes equal knobs so parent re-renders don't restart the sim.
    // topologyKey (not `nodes`/`edges`) so label-only updates don't reheat.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see layoutConfigKey / topologyKey
  }, [
    hasMounted,
    topologyKey,
    size.width,
    size.height,
    layoutConfigKey,
    publishNodes,
  ]);

  // Patch labels in place when titles refresh without changing the graph.
  useEffect(() => {
    if (nodesRef.current.length === 0) return;
    const nextById = new Map(nodes.map((n) => [n.id, n]));
    let changed = false;
    for (const live of nodesRef.current) {
      const fresh = nextById.get(live.id);
      if (!fresh) continue;
      if (live.label !== fresh.label || live.description !== fresh.description) {
        live.label = fresh.label;
        live.description = fresh.description;
        changed = true;
      }
    }
    if (changed) publishNodes();
  }, [nodes, publishNodes]);

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

  function viewPointFromClient(clientX: number, clientY: number): PointerPos {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY, clientX, clientY };
    const rect = svg.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      clientX,
      clientY,
    };
  }

  function twoPointerPair(): PinchPair | null {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return null;
    return pairFromPoints(points[0]!, points[1]!);
  }

  function capturePointer(element: HTMLElement, pointerId: number) {
    try {
      if (!element.hasPointerCapture(pointerId)) {
        element.setPointerCapture(pointerId);
      }
    } catch {
      // Pointer already released (finger lifted mid-gesture).
    }
  }

  function releasePointer(element: HTMLElement, pointerId: number) {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Already released.
    }
  }

  function cancelNodeDragForPinch() {
    if (!dragRef.current) return;
    // Click-in-progress never set fx/fy. A started drag keeps its pin.
    simRef.current?.alphaTarget(0);
    dragRef.current = null;
  }

  function beginPinch(element: HTMLElement) {
    touchTapRef.current = null;
    panRef.current = null;
    cancelNodeDragForPinch();
    const pair = twoPointerPair();
    if (!pair) return;
    pinchRef.current = { last: pair };
    for (const id of pointersRef.current.keys()) {
      capturePointer(element, id);
    }
  }

  function onViewportPointerDownCapture(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    pointersRef.current.set(
      event.pointerId,
      viewPointFromClient(event.clientX, event.clientY),
    );

    if (pointersRef.current.size >= 2) {
      event.preventDefault();
      event.stopPropagation();
      beginPinch(event.currentTarget);
      return;
    }

    const isTouch = event.pointerType === "touch";
    const nodeId = nodeIdFromTarget(event.target);
    if (isTouch && nodeId) {
      touchTapRef.current = {
        nodeId,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    }

    // One finger (touch anywhere) or mouse on empty canvas → pan.
    // Mouse on a node stays a node-drag (handled on the node itself).
    if (isTouch || !isMapNodeTarget(event.target)) {
      panRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        armed: !isTouch,
      };
      if (!isTouch) capturePointer(event.currentTarget, event.pointerId);
    }
  }

  function onViewportPointerMoveCapture(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(
      event.pointerId,
      viewPointFromClient(event.clientX, event.clientY),
    );

    if (pointersRef.current.size >= 2) {
      event.preventDefault();
      event.stopPropagation();
      if (!pinchRef.current) beginPinch(event.currentTarget);
      const next = twoPointerPair();
      const prev = pinchRef.current?.last;
      if (!next || !prev) return;
      pinchRef.current = { last: next };
      setView((current) => pinchView(current, prev, next));
      return;
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || pinchRef.current) return;

    const dx = event.clientX - pan.lastX;
    const dy = event.clientY - pan.lastY;
    if (!pan.armed) {
      if (Math.hypot(dx, dy) < PAN_START_PX) return;
      pan.armed = true;
      touchTapRef.current = null;
      capturePointer(event.currentTarget, event.pointerId);
    }

    event.preventDefault();
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    setView((current) => ({
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    }));
  }

  function onViewportPointerUpCapture(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const wasPinching = pinchRef.current != null;
    const tap = touchTapRef.current;
    pointersRef.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (wasPinching && pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.entries()][0];
      if (remaining) {
        const [remainingId, pos] = remaining;
        panRef.current = {
          pointerId: remainingId,
          lastX: pos.clientX,
          lastY: pos.clientY,
          armed: true,
        };
        capturePointer(event.currentTarget, remainingId);
      }
    } else if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      pinchRef.current = null;
      panRef.current = null;
    }

    if (
      tap &&
      tap.pointerId === event.pointerId &&
      !wasPinching &&
      Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < TAP_MAX_PX
    ) {
      selectNode(tap.nodeId);
    }
    if (tap?.pointerId === event.pointerId) {
      touchTapRef.current = null;
    }
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
          Scroll or pinch to zoom · drag to pan · drag a node to pin it ·
          double-click a pin to release · Tab/arrows for keyboard
        </p>
      )}

      <div
        ref={containerRef}
        className={`relative min-h-0 flex-1 overflow-hidden overscroll-none touch-none ${hideChrome ? "" : "rounded-lg"}`}
        style={{ background: canvasFill }}
        onPointerDownCapture={onViewportPointerDownCapture}
        onPointerMoveCapture={onViewportPointerMoveCapture}
        onPointerUpCapture={onViewportPointerUpCapture}
        onPointerCancelCapture={onViewportPointerUpCapture}
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
            aria-label="Knowledge Map. Scroll or pinch to zoom, drag to pan, drag nodes to pin."
            className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
            onWheel={(event) => {
              event.preventDefault();
              const intensity = Math.min(Math.abs(event.deltaY), 100) / 100;
              const step = 0.008 + intensity * 0.01;
              const factor = event.deltaY > 0 ? 1 - step : 1 + step;
              const point = viewPointFromClient(event.clientX, event.clientY);
              setView((current) =>
                zoomAroundPoint(
                  current,
                  point.x,
                  point.y,
                  current.k * factor,
                ),
              );
            }}
          >
            {/* Hit target uses theme base; wallpaper lives inside the transform. */}
            <rect
              width="100%"
              height="100%"
              fill={canvasFill}
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
                const r = radiusFor(node.type, layoutConfig);
                const spriteHref =
                  useSprites && wallpaperTheme
                    ? nodeSpriteUrl(wallpaperTheme, node.type, node.id)
                    : null;
                const spriteSize = spriteSizeFor(r, layoutConfig.spriteScale);
                const labelMax = layoutConfig.labelMaxLength;
                return (
                  <g
                    key={node.id}
                    data-km-node={node.id}
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
                      if (event.button !== 0) return;
                      // Touch: one finger pans the map; tap-to-select is handled
                      // on the canvas. Mouse/pen still drag-to-pin.
                      if (event.pointerType === "touch") return;
                      event.stopPropagation();
                      const live = findSimNode(node.id);
                      if (!live) return;
                      // Click must not pin or reheat — that shoved neighbors
                      // further apart after each select. Drag starts later.
                      nodeDragMovedRef.current = false;
                      dragRef.current = {
                        id: live.id,
                        pointerId: event.pointerId,
                        lastX: event.clientX,
                        lastY: event.clientY,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (
                        dragRef.current?.id !== node.id ||
                        dragRef.current.pointerId !== event.pointerId
                      ) {
                        return;
                      }
                      const live = findSimNode(node.id);
                      if (!live) return;
                      const dx = event.clientX - dragRef.current.lastX;
                      const dy = event.clientY - dragRef.current.lastY;
                      if (!nodeDragMovedRef.current) {
                        if (Math.hypot(dx, dy) <= 4) return;
                        nodeDragMovedRef.current = true;
                        const start = clientToGraph(
                          dragRef.current.lastX,
                          dragRef.current.lastY,
                        );
                        live.fx = start.x;
                        live.fy = start.y;
                        simRef.current?.alphaTarget(0.25).restart();
                      }
                      const point = clientToGraph(event.clientX, event.clientY);
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
                        dragRef.current?.id !== node.id ||
                        dragRef.current.pointerId !== event.pointerId
                      ) {
                        return;
                      }
                      const live = findSimNode(node.id);
                      if (!live) return;
                      const wasClick = !nodeDragMovedRef.current;
                      // Stay pinned after a drag so peers can settle around it.
                      // Pure click selects and leaves layout / pins alone.
                      if (wasClick) {
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
                    <circle
                      r={spriteHref ? Math.max(r, spriteSize / 2) : r}
                      fill="transparent"
                    />
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
                      className={`font-display font-medium select-none ${themePalette ? "" : "fill-paper"}`}
                      fill={themePalette ? labelFill : undefined}
                      style={{
                        pointerEvents: "none",
                        fontSize: layoutConfig.labelFontSize,
                      }}
                    >
                      {node.label.length > labelMax
                        ? `${node.label.slice(0, Math.max(1, labelMax - 1))}…`
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
            className="absolute inset-x-3 bottom-3 top-auto z-10 max-h-[min(50vh,24rem)] w-auto overflow-y-auto shadow-lg sm:inset-y-3 sm:bottom-auto sm:left-auto sm:right-3 sm:max-h-none sm:w-[min(100%-1.5rem,18rem)]"
          />
        ) : null}
      </div>
    </div>
  );
}
