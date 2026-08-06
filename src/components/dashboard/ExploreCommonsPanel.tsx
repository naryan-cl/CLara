"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import { FadeRise } from "@/components/motion/FadeRise";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";

type View = "map" | "list";

function relatedCounts(nodes: GraphNode[], edges: GraphEdge[]) {
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.id, 0);
  for (const edge of edges) {
    counts.set(edge.sourceNodeId, (counts.get(edge.sourceNodeId) ?? 0) + 1);
    counts.set(edge.targetNodeId, (counts.get(edge.targetNodeId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Dashboard's "explore" side: List/Map toggle over the stream's Knowledge
 * Map data, plus quick entry points into Add. Map view reuses the real
 * KnowledgeMap component (dark canvas, force layout) rather than a second
 * bespoke map — one implementation, real data.
 */
export function ExploreCommonsPanel({
  nodes,
  edges,
  error,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  error?: string | null;
}) {
  const [view, setView] = useState<View>("map");
  const counts = useMemo(() => relatedCounts(nodes, edges), [nodes, edges]);

  return (
    <section className="flex flex-col gap-6 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-ink">
          Explore Commons
        </h2>
        <div className="inline-flex gap-1 rounded-pill bg-cloud/40 p-1">
          <ViewButton active={view === "map"} onClick={() => setView("map")}>
            Map
          </ViewButton>
          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </ViewButton>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="font-mono text-sm text-danger">{error}</p>
          <p className="mt-2 text-sm text-ink/60">
            If this mentions a missing table, run migration{" "}
            <span className="font-mono text-xs">0010_knowledge_map.sql</span>{" "}
            in Supabase, then refresh.
          </p>
        </div>
      ) : nodes.length === 0 ? (
        <div className="relative min-h-[12rem] overflow-hidden rounded-lg border border-dashed border-sage/40 bg-sand/40 px-5 py-8">
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-glow/25 blur-2xl animate-clara-breathe motion-reduce:animate-none"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-3 left-8 h-2 w-2 rounded-full bg-glow/60"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-8 left-16 h-1.5 w-1.5 rounded-full bg-horizon/50"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-14 top-12 h-1.5 w-1.5 rounded-full bg-sage/60"
            aria-hidden="true"
          />
          <div className="relative flex max-w-md flex-col gap-2">
            <p className="font-display text-base text-ink">
              The map is connected — it&apos;s waiting for concepts
            </p>
            <p className="text-sm leading-6 text-ink/60">
              Nodes appear after a <strong>Public</strong> Commons document is
              saved and the Knowledge Map extraction job runs (Inngest{" "}
              <span className="font-mono text-[11px]">clara-extract-graph</span>
              ). Private reflections stay off the map by design.
            </p>
            <p className="text-sm text-ink/55">
              Try{" "}
              <Link href="/commons" className="text-horizon hover:underline">
                Commons
              </Link>{" "}
              for documents, or add something Public below.
            </p>
          </div>
        </div>
      ) : view === "map" ? (
        <FadeRise key="map" className="min-w-0">
          <KnowledgeMap nodes={nodes} edges={edges} />
        </FadeRise>
      ) : (
        <FadeRise key="list" className="grid gap-4 sm:grid-cols-2">
          {nodes.map((node, index) => (
            <div
              key={node.id}
              className="card-press rounded-lg border border-cloud bg-paper p-5 shadow-soft transition-[box-shadow,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:shadow-glow animate-fade-rise motion-reduce:animate-none"
              style={{
                animationDelay: `${Math.min(index, 5) * 40}ms`,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg text-ink">{node.label}</p>
                <span className="shrink-0 rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
                  {node.type}
                </span>
              </div>
              {node.description ? (
                <p className="mt-1 text-sm text-ink/60">
                  {node.description}
                </p>
              ) : null}
              <p className="mt-3 font-mono text-[11px] tracking-wide text-sage">
                {counts.get(node.id) ?? 0} RELATED
              </p>
            </div>
          ))}
        </FadeRise>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-cloud/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/add/record"
            className="btn-primary flex flex-1 items-center justify-center gap-2 rounded-md bg-forest px-4 py-3 text-sm font-medium text-paper"
          >
            <MicIcon />
            Record
          </Link>
          <Link
            href="/add/chat"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-forest px-4 py-3 text-sm font-medium text-forest transition-[background-color,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:bg-forest/5 hover:-translate-y-px active:translate-y-0"
          >
            <PencilIcon />
            Reflect
          </Link>
          <Link
            href="/add/upload"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-forest px-4 py-3 text-sm font-medium text-forest transition-[background-color,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:bg-forest/5 hover:-translate-y-px active:translate-y-0"
          >
            <UploadIcon />
            Upload
          </Link>
        </div>
      </div>
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-pill px-5 py-2 text-sm font-semibold transition-[color,background-color,box-shadow] duration-[var(--duration-ui)] ease-[var(--ease)] ${
        active
          ? "bg-forest text-paper shadow-[0_0_16px_rgba(143,214,196,0.25)]"
          : "text-ink/60 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="M6 9l6-6 6 6" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
