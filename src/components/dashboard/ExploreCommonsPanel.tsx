"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CommonsDetailPopup } from "@/components/CommonsDetailPopup";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import { FadeRise } from "@/components/motion/FadeRise";
import { commonsItemsToGraph } from "@/lib/commons/to-graph";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

type View = "map" | "list";

function elementLabel(item: CommonsListItem) {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return item.type ?? "Document";
}

/**
 * Dashboard's "explore" side: List/Map toggle over the stream's Commons
 * items, plus quick entry points into Add. Map reuses KnowledgeMap with a
 * Commons-derived graph so contributors appear even before concept extraction.
 * Node detail is owned by DashboardGrid (slides over Ask CLara).
 */
export function ExploreCommonsPanel({
  items,
  streamId,
  currentUserId,
  error,
  selectedMapNodeId = null,
  onMapNodeSelect,
}: {
  items: CommonsListItem[];
  streamId: string;
  currentUserId: string;
  error?: string | null;
  selectedMapNodeId?: string | null;
  onMapNodeSelect?: (node: GraphNode | null) => void;
}) {
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState<CommonsListItem | null>(null);
  const { nodes, edges } = useMemo(
    () => commonsItemsToGraph(items, streamId),
    [items, streamId],
  );

  const actionClass =
    "flex flex-1 items-center justify-center gap-2 rounded-md border border-forest px-4 py-3 text-sm font-medium text-forest transition-[background-color,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:bg-forest/5 hover:-translate-y-px active:translate-y-0";

  function setViewAndClear(next: View) {
    setView(next);
    if (next !== "map") onMapNodeSelect?.(null);
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-6 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-ink">
          Explore Commons
        </h2>
        <div className="inline-flex gap-1 rounded-pill bg-cloud/40 p-1">
          <ViewButton active={view === "map"} onClick={() => setViewAndClear("map")}>
            Map
          </ViewButton>
          <ViewButton
            active={view === "list"}
            onClick={() => setViewAndClear("list")}
          >
            List
          </ViewButton>
        </div>
      </div>

      <div
        className={`min-h-0 flex-1 ${view === "map" && items.length > 0 && !error ? "overflow-hidden" : "overflow-auto"}`}
      >
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
            <p className="font-mono text-sm text-danger">{error}</p>
            <p className="mt-2 text-sm text-ink/60">
              If this mentions missing tables or infinite recursion, check
              Commons migrations (
              <span className="font-mono text-xs">0011</span>–
              <span className="font-mono text-xs">0013</span>) in Supabase, then
              refresh.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="relative min-h-[12rem] overflow-hidden rounded-lg border border-dashed border-sage/40 bg-sand/40 px-5 py-8">
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-glow/25 blur-2xl animate-clara-breathe motion-reduce:animate-none"
              aria-hidden="true"
            />
            <div className="relative flex max-w-md flex-col gap-2">
              <p className="font-display text-base text-ink">
                The Commons is waiting for its first contribution
              </p>
              <p className="text-sm leading-6 text-ink/60">
                Record, Reflect, or Upload below — items show up here in both
                map and list as soon as they land in this stream.
              </p>
              <p className="text-sm text-ink/55">
                Full filters live on{" "}
                <Link href="/commons" className="text-horizon hover:underline">
                  Commons
                </Link>
                .
              </p>
            </div>
          </div>
        ) : view === "map" ? (
          <FadeRise key="map" className="h-full min-h-0 min-w-0">
            <KnowledgeMap
              nodes={nodes}
              edges={edges}
              selectedId={selectedMapNodeId}
              onSelect={onMapNodeSelect}
              hideDetailPanel
            />
          </FadeRise>
        ) : (
          <FadeRise key="list" className="grid gap-3 sm:grid-cols-2">
            {items.map((item, index) => {
              const isPrivate =
                item.kind === "document" && item.privacy_status === "private";
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="card-press rounded-lg border border-cloud bg-sand/40 p-4 text-left shadow-soft transition-[box-shadow,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:border-sage/50 hover:bg-sand hover:shadow-glow animate-fade-rise motion-reduce:animate-none"
                  style={{
                    animationDelay: `${Math.min(index, 5) * 40}ms`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-base text-ink">
                      {item.title}
                    </p>
                    <span className="shrink-0 rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
                      {elementLabel(item)}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] tracking-wide text-ink/45">
                    {isPrivate ? "Private · " : ""}
                    {item.kind === "document" && item.needs_review
                      ? "Needs review · "
                      : ""}
                    {new Date(
                      item.kind === "session" && item.occurred_at
                        ? item.occurred_at
                        : item.created_at,
                    ).toLocaleDateString()}
                  </p>
                </button>
              );
            })}
          </FadeRise>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-3 rounded-lg border border-cloud/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/add/record" className={actionClass}>
            <MicIcon />
            Record
          </Link>
          <Link href="/add/chat" className={actionClass}>
            <PencilIcon />
            Reflect
          </Link>
          <Link href="/add/upload" className={actionClass}>
            <UploadIcon />
            Upload
          </Link>
        </div>
      </div>

      {selected ? (
        <CommonsDetailPopup
          key={`${selected.kind}-${selected.id}`}
          item={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
        />
      ) : null}
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
