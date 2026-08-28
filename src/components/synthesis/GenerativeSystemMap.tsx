"use client";

import { forceX, forceY } from "d3-force";
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
  MAP_BUILD_STEPS,
  radiusByNodeId,
  strokeByNodeId,
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
      fx: null,
      fy: null,
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
  const strokesRef = useRef(strokeByNodeId());
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const dragMovedRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [simNodes, setSimNodes] = useState<SynthesisSimNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>("client-value-trust");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [storyStep, setStoryStep] = useState<number | null>(null);

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const edges = toGraphEdges();
  const inStoryMode = storyStep != null;
  const currentStep = inStoryMode ? MAP_BUILD_STEPS[storyStep] : null;
  const visibleNodeIds = new Set(
    inStoryMode ? currentStep!.nodeIds : GENERATIVE_SYSTEM_NODES.map((n) => n.id),
  );
  const visibleEdgeIds = new Set(
    inStoryMode ? currentStep!.edgeIds : edges.map((e) => e.id),
  );

  const publishNodes = useCallback(() => {
    setSimNodes(nodesRef.current.slice());
  }, []);

  useEffect(() => {
    const seeded = buildInitialSimNodes();
    nodesRef.current = seeded;
    const anchors = anchorsRef.current;
    const simulation = createGraphSimulation(
      seeded,
      edges,
      SYNTHESIS_MAP_WIDTH,
      SYNTHESIS_MAP_HEIGHT,
      LAYOUT_CONFIG,
      0.85,
    );
    simulation
      .force(
        "anchorX",
        forceX<SynthesisSimNode>(
          (d) => anchors.get(d.id)?.x ?? d.x,
        ).strength(SYNTHESIS_MAP_LAYOUT.anchorStrength),
      )
      .force(
        "anchorY",
        forceY<SynthesisSimNode>(
          (d) => anchors.get(d.id)?.y ?? d.y,
        ).strength(SYNTHESIS_MAP_LAYOUT.anchorStrength),
      );
    simulation.on("tick", publishNodes);
    simRef.current = simulation;
    publishNodes();
    simulation.alphaTarget(0.02).restart();

    return () => {
      simulation.stop();
      simRef.current = null;
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [edges, publishNodes]);

  useEffect(() => {
    if (!inStoryMode || !currentStep?.focusNodeId) return;
    setSelectedId(currentStep.focusNodeId);
    reheat();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reheat when step changes
  }, [storyStep]);

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

  function scheduleReleasePin(nodeId: string) {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = null;
      node.fy = null;
      reheat();
      publishNodes();
    }, SETTLE_MS);
  }

  function startStory() {
    setStoryStep(0);
  }

  function exitStory() {
    setStoryStep(null);
    setSelectedId("client-value-trust");
    reheat();
  }

  function stepStory(delta: number) {
    setStoryStep((prev) => {
      if (prev == null) return 0;
      const next = Math.min(
        MAP_BUILD_STEPS.length - 1,
        Math.max(0, prev + delta),
      );
      return next;
    });
  }

  const nodeById = new Map(simNodes.map((n) => [n.id, n]));
  const selected = selectedId ? nodeById.get(selectedId) : null;
  const selectedDef = GENERATIVE_SYSTEM_NODES.find((n) => n.id === selectedId);
  const edgeAnnotations = selectedId ? annotationsForNode(selectedId) : [];

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cloud bg-paper px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {!inStoryMode ? (
            <button
              type="button"
              onClick={startStory}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cloud bg-paper px-3 py-1.5 font-mono text-[0.68rem] font-medium uppercase tracking-wider text-forest shadow-soft transition hover:border-sage"
              aria-label="Build the map step by step"
            >
              <span aria-hidden className="text-sm leading-none">
                ▶
              </span>
              Build story
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => stepStory(-1)}
                disabled={storyStep === 0}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cloud bg-paper text-forest shadow-soft transition hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous step"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => stepStory(1)}
                disabled={storyStep === MAP_BUILD_STEPS.length - 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cloud bg-paper text-forest shadow-soft transition hover:border-sage disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next step"
              >
                →
              </button>
              <span className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.06em] text-ink/55">
                Step {storyStep! + 1} / {MAP_BUILD_STEPS.length}
                <span className="mx-1.5 text-cloud">·</span>
                {currentStep?.title}
              </span>
              <button
                type="button"
                onClick={exitStory}
                className="rounded-lg border border-cloud bg-sand/60 px-2.5 py-1 font-mono text-[0.65rem] font-medium uppercase tracking-wider text-ink/60 transition hover:border-sage hover:text-forest"
              >
                Exit
              </button>
            </>
          )}
        </div>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-ink/45">
          Drag to explore · click for quotes
        </p>
      </div>

      <div className="grid min-h-[min(52vh,480px)] grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
        <div className="relative overflow-hidden bg-gradient-to-b from-paper to-sand/80">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SYNTHESIS_MAP_WIDTH} ${SYNTHESIS_MAP_HEIGHT}`}
            role="img"
            aria-label="Generative system map. Drag nodes to explore connections."
            className="block h-full min-h-[min(52vh,480px)] w-full touch-none"
          >
            <rect
              width={SYNTHESIS_MAP_WIDTH}
              height={SYNTHESIS_MAP_HEIGHT}
              fill="transparent"
            />

            {edges.map((edge) => {
              if (!visibleEdgeIds.has(edge.id)) return null;
              const source = nodeById.get(edge.sourceNodeId);
              const target = nodeById.get(edge.targetNodeId);
              if (!source || !target) return null;
              if (
                !visibleNodeIds.has(edge.sourceNodeId) ||
                !visibleNodeIds.has(edge.targetNodeId)
              ) {
                return null;
              }
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
              if (!visibleNodeIds.has(node.id)) return null;
              const isSelected = node.id === selectedId;
              const isHovered = node.id === hoveredId;
              const isLit = isSelected || isHovered;
              const isDragging = node.id === draggingId;
              const isPinned = node.fx != null && node.fy != null;
              const r = node.radius ?? 28;
              const fill = fillsRef.current.get(node.id) ?? "#7FA093";
              const stroke =
                strokesRef.current.get(node.id) ??
                (isLit ? "#2E4B45" : "rgba(46,75,69,0.35)");
              const lines = (
                GENERATIVE_SYSTEM_NODES.find((n) => n.id === node.id)?.label ??
                node.label
              ).split("\n");

              return (
                <g
                  key={node.id}
                  data-gsm-node={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-grab outline-none active:cursor-grabbing"
                  style={{
                    opacity: 1,
                    transition: reducedMotion ? undefined : "opacity 0.35s ease",
                  }}
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
                      const start = clientToGraph(
                        dragRef.current.lastX,
                        dragRef.current.lastY,
                      );
                      live.fx = start.x;
                      live.fy = start.y;
                      simRef.current?.alphaTarget(0.22).restart();
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
                      scheduleReleasePin(node.id);
                      reheat();
                    }
                    setDraggingId(null);
                    simRef.current?.alphaTarget(0.02);
                    dragRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    publishNodes();
                  }}
                >
                  <circle
                    r={r}
                    fill={fill}
                    fillOpacity={isLit ? 0.95 : 0.82}
                    stroke={isLit ? stroke : "rgba(46,75,69,0.35)"}
                    strokeWidth={isLit ? 2.5 : 1.5}
                    style={
                      isLit
                        ? {
                            filter: `drop-shadow(0 0 12px ${stroke}88)`,
                          }
                        : undefined
                    }
                  />
                  {isDragging || isPinned ? (
                    <circle
                      r={r + 4}
                      fill="none"
                      stroke={stroke}
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

          {inStoryMode && currentStep ? (
            <div className="absolute inset-x-0 bottom-0 border-t border-cloud/80 bg-paper/92 px-4 py-3 backdrop-blur-sm">
              <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.08em] text-horizon">
                {currentStep.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink/85">
                {currentStep.caption}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="max-h-[min(52vh,480px)] overflow-y-auto border-t border-cloud bg-paper px-4 py-4 lg:border-l lg:border-t-0 sm:px-5">
          <SynthesisMapDetail
            evidenceKey={selected?.evidenceKey ?? null}
            nodeLabel={
              selectedDef?.label.replace(/\n/g, " ") ?? "Explore the system"
            }
            edgeAnnotations={edgeAnnotations}
          />
        </aside>
      </div>
    </div>
  );
}
