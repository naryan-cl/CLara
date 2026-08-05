"use client";

import { useMemo, useState } from "react";
import { CommonsDetailPopup } from "@/components/CommonsDetailPopup";
import {
  DEFAULT_COMMONS_FILTERS,
  filterCommonsItems,
  type CommonsFilterState,
  type CommonsListItem,
} from "@/lib/commons/types";

function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function elementLabel(item: CommonsListItem) {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return item.type ?? "Document";
}

export function CommonsRepository({
  items,
  currentUserId,
}: {
  items: CommonsListItem[];
  currentUserId: string;
}) {
  const [filters, setFilters] = useState<CommonsFilterState>(
    DEFAULT_COMMONS_FILTERS,
  );
  const [selected, setSelected] = useState<CommonsListItem | null>(null);

  const visible = useMemo(
    () => filterCommonsItems(items, filters, currentUserId),
    [items, filters, currentUserId],
  );

  function patchFilter<K extends keyof CommonsFilterState>(
    key: K,
    value: CommonsFilterState[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
        <h2 className="font-display text-base font-medium text-ink">
          Filters & sort
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink/70">Element type</span>
            <select
              value={filters.elementType}
              onChange={(e) =>
                patchFilter(
                  "elementType",
                  e.target.value as CommonsFilterState["elementType"],
                )
              }
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
            >
              <option value="all">All</option>
              <option value="chat">Chat (reflections)</option>
              <option value="record">Record (transcripts)</option>
              <option value="upload">Upload (notes & files)</option>
              <option value="session">Sessions</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink/70">From date</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => patchFilter("dateFrom", e.target.value)}
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink/70">To date</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => patchFilter("dateTo", e.target.value)}
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink/70">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) =>
                patchFilter("sort", e.target.value as CommonsFilterState["sort"])
              }
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink/80 sm:mt-6">
            <input
              type="checkbox"
              checked={filters.attendedOnly}
              onChange={(e) => patchFilter("attendedOnly", e.target.checked)}
              className="rounded border-cloud"
            />
            Attended only
          </label>

          <label className="flex items-center gap-2 text-sm text-ink/80 sm:mt-6">
            <input
              type="checkbox"
              checked={filters.myArtifactsOnly}
              onChange={(e) => patchFilter("myArtifactsOnly", e.target.checked)}
              className="rounded border-cloud"
            />
            My artifacts
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-6">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-medium text-ink">
            Repository
          </h2>
          <p className="font-mono text-[11px] text-ink/40">
            {visible.length} of {items.length}
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Nothing matches these filters. Try clearing them, or contribute via
            Add → Chat / Record / Upload.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {visible.map((item) => {
              const isPrivate =
                item.kind === "document" && item.privacy_status === "private";
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="flex w-full flex-col gap-1 rounded-md border border-cloud bg-sand/40 px-3 py-3 text-left transition-colors hover:border-sage/50 hover:bg-sand"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{item.title}</span>
                      {isPrivate ? (
                        <span
                          className="shrink-0 text-ink/45"
                          title="Hidden from public — only you (and admins via edit) see this"
                        >
                          <EyeIcon />
                          <span className="sr-only">Private</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-[11px] text-ink/45">
                      {elementLabel(item)}
                      {item.kind === "document" && item.needs_review
                        ? " · needs review"
                        : ""}
                      {item.attending ? " · attended" : ""}
                      {" · "}
                      {new Date(
                        item.kind === "session" && item.occurred_at
                          ? item.occurred_at
                          : item.created_at,
                      ).toLocaleDateString()}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected ? (
        <CommonsDetailPopup
          key={`${selected.kind}-${selected.id}`}
          item={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
