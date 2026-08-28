"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { curvedPath, edgeEndpoints } from "@/lib/graph/curves";
import { createGraphSimulation, type SimNode } from "@/lib/graph/layout";
import type { MapLayoutConfig } from "@/lib/graph/map-layout-config";
import { DEFAULT_MAP_LAYOUT_CONFIG } from "@/lib/graph/map-layout-config";
import {
  anchorByNodeId,
  annotationsForNode,
  fillByNodeId,
  GENERATIVE_SYSTEM_NODES,
  GENERATIVE_SYSTEM_EDGES,
  radiusByNodeId,
  SYNTHESIS_MAP_HEIGHT,
  SYNTHESIS_MAP_LAYOUT,
  SYNTHESIS_MAP_WIDTH,
  toGraphEdges,
  toGraphNodes,
} from "@/lib/synthesis/generative-system-map-data";
import {
  THEME_EVIDENCE_UI,
  type ThemeEvidence,
} from "@/lib/synthesis/theme-evidence-ui";

const SETTLE_MS = 5000;
const SNAP_MS = 850;
const LABEL_FONT = 11;

const LAYOUT_CONFIG: MapLayoutConfig = {
  ...DEFAULT_MAP_LAYOUT_CONFIG,
  chargeStrength: SYNTHESIS_MAP_LAYOUT.chargeStrength,
  linkDistance: SYNTHESIS_MAP_LAYOUT.linkDistance,
  linkStrength: SYNTHESIS_MAP_LAYOUT.linkStrength,
  collidePadding: SYNTHESIS_MAP_LAYOUT.collidePadding,
  labelFontSize: LABEL_FONT,
};

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

type SynthesisSimNode = SimNode & { evidenceKey: string };

function buildInitialSimNodes(): SynthesisSimNode[] {
  const anchors = anchorByNodeId();
  const radii = radiusByNodeId();
  const graphNodes = toGraphNodes();
  return graphNodes.map((node) => {
    const def = GENERATIVE_SYSTEM_NODES.find((n) => n.id === node.id)!;
    const anchor = anchors.get(node.id)!;
    return {
      ...node,
      x: anchor.x,
      y: anchor.y,
      vx: 0,
      vy: 0,
      fx: anchor.x,
      fy: anchor.y,
      radius: radii.get(node.id) ?? 28,
      evidenceKey: def.evidenceKey,
    };
  });
}

function SynthesisMapDetail({
  evidenceKey,
  nodeLabel,
  edgeAnnotations,
}: {
  evidenceKey: string | null;
  nodeLabel: string;
  edgeAnnotations: string[];
}) {
  if (!evidenceKey) {
    return (
      <p className="text-sm leading-6 text-ink/60">
        Click a node for narrative and harvest-backed quotes.
      </p>
    );
  }

  const data: ThemeEvidence | undefined = THEME_EVIDENCE_UI[evidenceKey];

  if (!data) {
    return (
      <>
        <div className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] text-horizon">
          Node
        </div>
        <h3 className="font-display text-xl font-medium text-ink">{nodeLabel}</h3>
        <p className="mt-2 text-sm text-ink/60">No evidence packaged yet.</p>
      </>
    );
  }

  return (
    <>
      <div className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] text-horizon">
        Node
      </div>
      <h3 className="font-display text-xl font-medium text-ink">{data.title}</h3>
      {data.narrative ? (
        <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/90">
          {data.narrative}
        </p>
      ) : null}
      {edgeAnnotations.length > 0 ? (
        <div className="mt-4 rounded-lg border border-cloud bg-sand/50 px-3 py-2.5">
          <p className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] text-forest">
            Connected flows
          </p>
          <ul className="mt-2 space-y-1.5 text-sm italic leading-relaxed text-ink/75">
            {edgeAnnotations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-4 font-mono text-[0.72rem] font-medium uppercase tracking-[0.06em] text-forest">
        Key quotes
      </p>
      {(data.quotes ?? []).slice(0, 2).map((q) => (
        <blockquote
          key={q.text.slice(0, 40)}
          className="mt-2 border-l-[3px] border-ember bg-ember/5 py-2 pl-3 pr-2 text-sm leading-relaxed text-ink/90"
        >
          {q.text}
          <span className="mt-1 block text-xs font-semibold text-ink/55">
            {q.session}
            {q.note ? ` · ${q.note}` : ""}
          </span>
        </blockquote>
      ))}
      <details className="mt-4 border-t border-cloud pt-3">
        <summary className="cursor-pointer font-mono text-[0.72rem] font-medium uppercase tracking-[0.06em] text-forest">
          Insights
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink/85">
          {(data.insights ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
      <details className="mt-3 border-t border-cloud pt-3">
        <summary className="cursor-pointer font-mono text-[0.72rem] font-medium uppercase tracking-[0.06em] text-forest">
          Conflicting perspectives
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink/85">
          {(data.conflicts ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
      <details className="mt-3 border-t border-cloud pt-3">
        <summary className="cursor-pointer font-mono text-[0.72rem] font-medium uppercase tracking-[0.06em] text-forest">
          Sessions
        </summary>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          {(data.sessions ?? []).join(" · ")}
        </p>
      </details>
    </>
  );
}

export function GenerativeSystemMap({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof createGraphSimulation> | null>(null);
  const nodesRef = useRef<SynthesisSimNode[]>(buildInitialSimNodes());
  const anchorsRef = useRef(anchorByNodeId());
  const fillsRef = useRef(fillByNodeId());
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRafRef = useRef<number | null>(null);

  const [simNodes, setSimNodes] = useState<SynthesisSimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>("client-value-trust");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const edges = toGraphEdges();
  const publishNodes = useCallback(() => {
    setSimNodes(nodesRef.current.slice());
  }, []);

  useEffect(() => {
    const seeded = buildInitialSimNodes();
    nodesRef.current = seeded;
    const simulation = createGraphSimulation(
      seeded,
      edges,
      SYNTHESIS_MAP_WIDTH,
      SYNTHESIS_MAP_HEIGHT,
      LAYOUT_CONFIG,
      0.5,
    );
    simulation.on("tick", publishNodes);
    simRef.current = simulation;
    publishNodes();
    simulation.alpha(0.4).restart();

    return () => {
      simulation.stop();
      simRef.current = null;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (snapRafRef.current) cancelAnimationFrame(snapRafRef.current);
    };
  }, [edges, publishNodes]);

  const clientToGraph = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = SYNTHESIS_MAP_WIDTH / rect.width;
    const scaleY = SYNTHESIS_MAP_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  function reheat() {
    simRef.current?.alpha(0.35).restart();
  }

  function findNode(id: string) {
    return nodesRef.current.find((n) => n.id === id);
  }

  function scheduleSnapBack(nodeId: string) {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const idx = nodesRef.current.findIndex((n) => n.id === nodeId);
      const anchor = anchorsRef.current.get(nodeId);
      if (idx < 0 || !anchor) return;

      const snapNode = nodesRef.current[idx]!;
      const target = anchor;
      const startX = snapNode.x;
      const startY = snapNode.y;
      const startFx = snapNode.fx ?? startX;
      const startFy = snapNode.fy ?? startY;
      const startTime = performance.now();

      function step(now: number) {
        const t = Math.min(1, (now - startTime) / SNAP_MS);
        const ease = 1 - Math.pow(1 - t, 3);
        snapNode.x = startX + (target.x - startX) * ease;
        snapNode.y = startY + (target.y - startY) * ease;
        snapNode.fx = startFx + (target.x - startFx) * ease;
        snapNode.fy = startFy + (target.y - startFy) * ease;
        publishNodes();
        if (t < 1) {
          snapRafRef.current = requestAnimationFrame(step);
        } else {
          snapNode.x = target.x;
          snapNode.y = target.y;
          snapNode.fx = target.x;
          snapNode.fy = target.y;
          publishNodes();
          snapRafRef.current = null;
        }
      }

      if (snapRafRef.current) cancelAnimationFrame(snapRafRef.current);
      snapRafRef.current = requestAnimationFrame(step);
    }, SETTLE_MS);
  }

  const nodeById = new Map(simNodes.map((n) => [n.id, n]));
  const selected = selectedId ? nodeById.get(selectedId) : null;
  const selectedDef = GENERATIVE_SYSTEM_NODES.find((n) => n.id === selectedId);
  const edgeAnnotations = selectedId ? annotationsForNode(selectedId) : [];

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-t-lg bg-gradient-to-b from-paper to-sand/80">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SYNTHESIS_MAP_WIDTH} ${SYNTHESIS_MAP_HEIGHT}`}
          role="img"
          aria-label="Generative system map. Drag nodes to explore; they return to place after a few seconds."
          className="block h-[min(52vh,480px)] w-full touch-none"
        >
          <rect width={SYNTHESIS_MAP_WIDTH} height={SYNTHESIS_MAP_HEIGHT} fill="transparent" />

          {edges.map((edge) => {
            const source = nodeById.get(edge.sourceNodeId);
            const target = nodeById.get(edge.targetNodeId);
            if (!source || !target) return null;
            const sr = source.radius ?? 28;
            const tr = target.radius ?? 28;
            const { x1, y1, x2, y2 } = edgeEndpoints(
              source.x,
              source.y,
              sr,
              target.x,
              target.y,
              tr,
            );
            const d = curvedPath(x1, y1, x2, y2, edge.id);
            const active =
              selectedId === edge.sourceNodeId ||
              selectedId === edge.targetNodeId ||
              hoveredId === edge.sourceNodeId ||
              hoveredId === edge.targetNodeId;
            return (
              <path
                key={edge.id}
                d={d}
                fill="none"
                stroke={active ? "#3E6E8E" : "#7FA093"}
                strokeOpacity={active ? 0.85 : 0.45}
                strokeWidth={active ? 2 : 1.5}
                strokeDasharray="4 6"
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
            const isDragging = node.id === draggingId;
            const r = node.radius ?? 28;
            const fill = fillsRef.current.get(node.id) ?? "#7FA093";
            const lines = (
              GENERATIVE_SYSTEM_NODES.find((n) => n.id === node.id)?.label ?? node.label
            ).split("\n");

            return (
              <g
                key={node.id}
                data-gsm-node={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="cursor-grab outline-none active:cursor-grabbing"
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  const live = findNode(node.id);
                  if (!live) return;
                  dragMovedRef.current = false;
                  dragRef.current = {
                    id: live.id,
                    pointerId: event.pointerId,
                    lastX: event.clientX,
                    lastY: event.clientY,
                  };
                  if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
                  if (snapRafRef.current) cancelAnimationFrame(snapRafRef.current);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (
                    dragRef.current?.id !== node.id ||
                    dragRef.current.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  const live = findNode(node.id);
                  if (!live) return;
                  const dx = event.clientX - dragRef.current.lastX;
                  const dy = event.clientY - dragRef.current.lastY;
                  if (!dragMovedRef.current) {
                    if (Math.hypot(dx, dy) <= 4) return;
                    dragMovedRef.current = true;
                    setDraggingId(node.id);
                    for (const n of nodesRef.current) {
                      if (n.id !== node.id) {
                        n.fx = null;
                        n.fy = null;
                      }
                    }
                    simRef.current?.alphaTarget(0.2).restart();
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
                  const live = findNode(node.id);
                  if (!live) return;
                  const wasClick = !dragMovedRef.current;
                  if (wasClick) {
                    setSelectedId(live.id);
                  } else {
                    live.fx = live.x;
                    live.fy = live.y;
                    for (const n of nodesRef.current) {
                      if (n.id === node.id) continue;
                      const anchor = anchorsRef.current.get(n.id);
                      if (!anchor) continue;
                      n.x = anchor.x;
                      n.y = anchor.y;
                      n.vx = 0;
                      n.vy = 0;
                      n.fx = anchor.x;
                      n.fy = anchor.y;
                    }
                    scheduleSnapBack(node.id);
                    reheat();
                  }
                  setDraggingId(null);
                  simRef.current?.alphaTarget(0);
                  dragRef.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  publishNodes();
                }}
              >
                <circle
                  r={r}
                  fill={fill}
                  fillOpacity={isLit ? 0.95 : 0.82}
                  stroke={isLit ? "#2E4B45" : "rgba(46,75,69,0.35)"}
                  strokeWidth={isLit ? 2.5 : 1.5}
                  style={
                    isLit
                      ? { filter: "drop-shadow(0 0 12px rgba(143,214,196,0.55))" }
                      : undefined
                  }
                />
                {isDragging ? (
                  <circle
                    r={r + 4}
                    fill="none"
                    stroke="#2E4B45"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    style={{ pointerEvents: "none" }}
                  />
                ) : null}
                <circle r={r + 6} fill="transparent" />
                {lines.map((line, i) => (
                  <text
                    key={line}
                    y={r + 16 + i * 13}
                    textAnchor="middle"
                    className="select-none fill-ink font-medium"
                    style={{ pointerEvents: "none", fontSize: LABEL_FONT }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
        <p className="pointer-events-none absolute bottom-2 left-3 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink/45">
          Drag to explore · settles in 5s · click for quotes
        </p>
      </div>
      <div className="border-t border-cloud bg-paper px-4 py-4 sm:px-5">
        <SynthesisMapDetail
          evidenceKey={selected?.evidenceKey ?? null}
          nodeLabel={selectedDef?.label.replace(/\n/g, " ") ?? "Explore the system"}
          edgeAnnotations={edgeAnnotations}
        />
      </div>
    </div>
  );
}
