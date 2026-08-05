"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KnowledgeMap } from "@/components/KnowledgeMap";
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
      <div className="flex items-center justify-between">
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
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : nodes.length === 0 ? (
        <p className="text-sm text-ink/60">
          Nothing on the map yet — it fills in automatically as Public
          documents are added to the Commons.
        </p>
      ) : view === "map" ? (
        <KnowledgeMap nodes={nodes} edges={edges} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {nodes.map((node) => (
            <div
              key={node.id}
              className="rounded-lg border border-cloud bg-paper p-5 shadow-soft transition-shadow hover:shadow-glow"
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
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-cloud/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/add/record"
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-forest px-4 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            <MicIcon />
            Record
          </Link>
          <Link
            href="/add/chat"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-forest px-4 py-3 text-sm font-medium text-forest transition-colors hover:bg-forest/5"
          >
            <PencilIcon />
            Reflect
          </Link>
          <Link
            href="/add/upload"
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-forest px-4 py-3 text-sm font-medium text-forest transition-colors hover:bg-forest/5"
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
      className={`rounded-pill px-5 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-forest text-paper" : "text-ink/60 hover:text-ink"
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
