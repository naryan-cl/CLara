"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { computeGraphLayout, radiusFor } from "@/lib/graph/layout";
import {
  directionFromKey,
  findNearestInDirection,
} from "@/lib/graph/spatial-nav";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

const WIDTH = 900;
const HEIGHT = 560;

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

// The force simulation's 300 accumulated floating-point ticks don't land on
// bit-identical results between the server's Node/V8 and the browser's V8 —
// a real, observed hydration mismatch, not just theoretical. useSyncExternalStore
// with a stable server snapshot is the same escape hatch used for
// reducedMotion above: render a deterministic placeholder during SSR (and
// the first client render, before hydration completes) and only compute the
// real layout once we know we're safely past hydration.
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
 * Knowledge Map canvas (DESIGN_GUIDE.md "Knowledge Map"): dark forest-deep
 * surface, glow nodes, sage edges, slide-in detail panel.
 * Keyboard: Tab into the map, arrow keys move spatially between nodes,
 * Enter/Space open the detail panel, Escape clears selection.
 */
export function KnowledgeMap({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
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

  const laidOut = useMemo(
    () =>
      hasMounted ? computeGraphLayout(nodes, edges, WIDTH, HEIGHT) : null,
    [hasMounted, nodes, edges],
  );

  const nodeById = useMemo(
    () => new Map((laidOut ?? []).map((node) => [node.id, node])),
    [laidOut],
  );
  const selected = selectedId ? (nodeById.get(selectedId) ?? null) : null;

  // Keep DOM focus on the spatially focused node (roving tabindex).
  useEffect(() => {
    if (!focusedId) return;
    nodeRefs.current.get(focusedId)?.focus();
  }, [focusedId]);

  if (!laidOut) {
    return (
      <div
        className="flex h-[560px] items-center justify-center rounded-lg"
        style={{ background: "var(--forest-deep)" }}
      >
        <p className="font-mono text-xs text-sage">Laying out the map…</p>
      </div>
    );
  }

  const activeId = focusedId ?? selectedId ?? laidOut[0]?.id ?? null;

  function selectNode(id: string) {
    setFocusedId(id);
    setSelectedId(id);
  }

  function onNodeKeyDown(
    event: React.KeyboardEvent<SVGGElement>,
    nodeId: string,
  ) {
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      const next = findNearestInDirection(laidOut!, nodeId, direction);
      if (next) {
        setFocusedId(next.id);
        setSelectedId(next.id);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(nodeId);
      setFocusedId(nodeId);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSelectedId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-mono text-[11px] text-ink/45">
          Keyboard: Tab to a node, arrow keys move across the map, Enter opens
          details, Escape closes.
        </p>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Knowledge Map. Use arrow keys to move between nodes."
          className="w-full rounded-lg"
          style={{ background: "var(--forest-deep)" }}
        >
          <g>
            {edges.map((edge) => {
              const source = nodeById.get(edge.sourceNodeId);
              const target = nodeById.get(edge.targetNodeId);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
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
          </g>
          <g>
            {laidOut.map((node) => {
              const isSelected = node.id === selectedId;
              const isTabStop = node.id === activeId;
              return (
                <g
                  key={node.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(node.id, el);
                    else nodeRefs.current.delete(node.id);
                  }}
                  tabIndex={isTabStop ? 0 : -1}
                  role="button"
                  aria-label={`${node.type}: ${node.label}`}
                  aria-pressed={isSelected}
                  onClick={() => selectNode(node.id)}
                  onFocus={() => setFocusedId(node.id)}
                  onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                  className="cursor-pointer outline-none focus-visible:opacity-90"
                  transform={`translate(${node.x}, ${node.y})`}
                >
                  <circle
                    r={radiusFor(node.type)}
                    fill={colorFor(node.type)}
                    fillOpacity={isSelected ? 1 : 0.85}
                    style={
                      isSelected && !reducedMotion
                        ? {
                            animation:
                              "glow-pulse var(--duration-ambient) var(--ease) infinite",
                          }
                        : isSelected
                          ? {
                              filter:
                                "drop-shadow(0 0 12px rgba(143,214,196,.6))",
                            }
                          : undefined
                    }
                  />
                  <text
                    y={radiusFor(node.type) + 16}
                    textAnchor="middle"
                    className="fill-paper font-mono text-[10px]"
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
      </div>

      {selected ? (
        <aside className="w-full shrink-0 rounded-lg border border-cloud bg-paper p-6 shadow-soft animate-panel-slide-in motion-reduce:animate-none lg:w-72">
          <div className="flex items-start justify-between gap-2">
            <span className="rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
              {selected.type}
            </span>
            <button
              type="button"
              className="text-xs text-ink/50 hover:text-ink"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
          <h2 className="mt-2 font-display text-lg font-medium text-ink">
            {selected.label}
          </h2>
          {selected.description ? (
            <p className="mt-2 text-sm leading-6 text-ink/70">
              {selected.description}
            </p>
          ) : null}
          {selected.sourceDocumentId ? (
            <Link
              href={`/sessions/documents/${selected.sourceDocumentId}`}
              className="mt-4 inline-block text-sm text-horizon hover:underline"
            >
              View source document →
            </Link>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
