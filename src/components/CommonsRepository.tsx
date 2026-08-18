"use client";

import { useMemo, useState } from "react";
import { CommonsDetailPopup } from "@/components/CommonsDetailPopup";
import { SessionHighlightMark } from "@/components/SessionHighlightMark";
import {
  COMMONS_TYPE_LEGEND,
  colourForElementType,
} from "@/lib/commons/element-colours";
import {
  DEFAULT_COMMONS_FILTERS,
  filterCommonsItems,
  topLevelCommonsItems,
  type CommonsFilterState,
  type CommonsListItem,
} from "@/lib/commons/types";
import { SESSION_HIGHLIGHTS } from "@/lib/sessions/highlight";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visible = useMemo(
    () =>
      topLevelCommonsItems(
        filterCommonsItems(items, filters, currentUserId),
      ),
    [items, filters, currentUserId],
  );

  function patchFilter<K extends keyof CommonsFilterState>(
    key: K,
    value: CommonsFilterState[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
        <div className="flex flex-col gap-3">
          <label className="flex w-full flex-col gap-0.5 text-xs sm:max-w-xs">
            <span className="font-medium text-ink/55">Search</span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => patchFilter("search", e.target.value)}
              placeholder="Title or type…"
              className="min-h-11 rounded border border-cloud bg-sand px-2 py-1 text-sm text-ink placeholder:text-ink/35"
            />
          </label>

          <button
            type="button"
            className="min-h-11 self-start rounded-md border border-cloud px-3 py-2 text-sm font-medium text-ink/80 sm:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>

          <div
            className={`${
              filtersOpen ? "flex" : "hidden"
            } flex-wrap items-end gap-x-3 gap-y-2 sm:flex`}
          >
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-ink/55">Type</span>
            <select
              value={filters.elementType}
              onChange={(e) =>
                patchFilter(
                  "elementType",
                  e.target.value as CommonsFilterState["elementType"],
                )
              }
              className="rounded border border-cloud bg-sand px-2 py-1 text-sm text-ink"
            >
              <option value="all">All</option>
              <option value="chat">Chat</option>
              <option value="record">Record</option>
              <option value="upload">Upload</option>
              <option value="session">Sessions</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-ink/55">From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => patchFilter("dateFrom", e.target.value)}
              className="rounded border border-cloud bg-sand px-2 py-1 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-ink/55">To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => patchFilter("dateTo", e.target.value)}
              className="rounded border border-cloud bg-sand px-2 py-1 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-ink/55">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) =>
                patchFilter("sort", e.target.value as CommonsFilterState["sort"])
              }
              className="rounded border border-cloud bg-sand px-2 py-1 text-sm text-ink"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 pb-1 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={filters.attendedOnly}
              onChange={(e) => patchFilter("attendedOnly", e.target.checked)}
              className="rounded border-cloud"
            />
            Attended
          </label>

          <label className="flex items-center gap-1.5 pb-1 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={filters.myArtifactsOnly}
              onChange={(e) => patchFilter("myArtifactsOnly", e.target.checked)}
              className="rounded border-cloud"
            />
            Mine
          </label>

          <p className="pb-1 font-mono text-xs text-ink/40 sm:pb-1.5">
            {visible.length} of {items.length}
          </p>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            Nothing matches these filters. Try clearing them, or contribute via
            Add → Reflect / Record / Upload.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {visible.map((item) => {
              const isPrivate =
                item.kind === "document" && item.privacy_status === "private";
              const colour = colourForElementType(item.elementType);
              const highlight =
                item.kind === "session" ? item.highlight_color : null;
              const highlightSpec = highlight
                ? SESSION_HIGHLIGHTS[highlight]
                : null;
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className={`flex w-full flex-col gap-1 rounded-md border border-cloud border-l-4 px-3 py-3 text-left transition-colors hover:border-cloud hover:bg-sand ${
                      highlightSpec
                        ? `${highlightSpec.barClass} ${highlightSpec.washClass}`
                        : `bg-sand/40 ${colour.borderClass}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 flex-1 items-start gap-1.5 font-medium text-ink">
                        <SessionHighlightMark color={highlight} />
                        <span className="truncate">{item.title}</span>
                      </span>
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
                      <span className={colour.textClass}>{elementLabel(item)}</span>
                      {item.kind === "document" &&
                      item.processStatus !== "ready"
                        ? ` · ${
                            item.processStatus === "transcribing"
                              ? "transcribing"
                              : item.processStatus === "summarizing"
                                ? "summarizing"
                                : item.processStatus === "failed"
                                  ? "transcription failed"
                                  : "needs review"
                          }`
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

        <ul
          className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-cloud pt-3"
          aria-label="Type colour legend"
        >
          {COMMONS_TYPE_LEGEND.map((key) => {
            const colour = colourForElementType(key);
            return (
              <li
                key={key}
                className="flex items-center gap-1.5 font-mono text-[11px] text-ink/55"
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-sm ${colour.swatchClass}`}
                  aria-hidden="true"
                />
                {colour.label}
              </li>
            );
          })}
        </ul>
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
