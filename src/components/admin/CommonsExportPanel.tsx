"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { exportCommonsSelection } from "@/app/(app)/admin/export/actions";
import {
  exportCatalogHasContent,
  exportCatalogTypeLabel,
  type ExportCatalogItem,
} from "@/lib/commons/export-catalog";
import {
  DEFAULT_COMMONS_FILTERS,
  filterCommonsItems,
  type CommonsFilterState,
} from "@/lib/commons/types";
import {
  exportFilename,
  formatExportDate,
  type ExportContentMode,
} from "@/lib/commons/export";
import { colourForElementType } from "@/lib/commons/element-colours";

function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function itemKey(item: ExportCatalogItem): string {
  return item.key;
}

export function CommonsExportPanel({
  streamName,
  streamSlug,
  items,
  currentUserId,
}: {
  streamName: string;
  streamSlug: string;
  items: ExportCatalogItem[];
  currentUserId: string;
}) {
  const [mode, setMode] = useState<ExportContentMode>("transcript");
  const [filters, setFilters] = useState<CommonsFilterState>(
    DEFAULT_COMMONS_FILTERS,
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(
    () =>
      filterCommonsItems(
        items,
        filters,
        currentUserId,
      ) as ExportCatalogItem[],
    [items, filters, currentUserId],
  );

  const exportableVisible = useMemo(
    () => visible.filter((item) => exportCatalogHasContent(item, mode)),
    [visible, mode],
  );

  const selectedExportableCount = useMemo(() => {
    let count = 0;
    for (const item of visible) {
      if (!selected.has(itemKey(item))) continue;
      if (exportCatalogHasContent(item, mode)) count += 1;
    }
    return count;
  }, [visible, selected, mode]);

  function patchFilter<K extends keyof CommonsFilterState>(
    key: K,
    value: CommonsFilterState[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function toggleItem(item: ExportCatalogItem) {
    if (!exportCatalogHasContent(item, mode)) return;
    const key = itemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of exportableVisible) {
        next.add(itemKey(item));
      }
      return next;
    });
  }

  function selectNoneVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of visible) {
        next.delete(itemKey(item));
      }
      return next;
    });
  }

  function handleExport() {
    setMessage(null);
    setError(null);

    const documentIds: string[] = [];
    const sessionIds: string[] = [];

    for (const item of visible) {
      if (!selected.has(itemKey(item))) continue;
      if (!exportCatalogHasContent(item, mode)) continue;
      if (item.kind === "document") documentIds.push(item.id);
      else sessionIds.push(item.id);
    }

    startTransition(async () => {
      const result = await exportCommonsSelection({
        documentIds,
        sessionIds,
        mode,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      downloadMarkdown(
        exportFilename(streamSlug, mode),
        result.markdown,
      );

      const skippedNote =
        result.skipped > 0 ? ` (${result.skipped} skipped — no ${mode} yet)` : "";
      setMessage(
        `Downloaded ${result.exported} element${result.exported === 1 ? "" : "s"}${skippedNote}.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-ink/55">
          <Link
            href="/admin"
            className="text-horizon underline-offset-2 hover:underline"
          >
            Admin
          </Link>
          <span className="mx-1.5 text-ink/30">/</span>
          Export
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Export Commons
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Download Markdown from {streamName}. Choose transcript text or CLara
          summaries, filter the list, select what to include, then export one
          combined file.
        </p>
      </div>

      <div
        className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-ink/80"
        role="note"
      >
        <p className="font-medium text-ink">Privacy reminder</p>
        <p className="mt-1">
          Exports can include participant speech, reflections, and private
          Commons items visible to you as a stream admin. Keep downloaded files
          on your device or in a private folder — do not commit them to this
          public repo. Uploading to tools like NotebookLM sends the content to
          that provider; treat it like sharing the Commons outside CLara.
        </p>
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Export content</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "transcript"}
                onChange={() => setMode("transcript")}
              />
              Transcripts &amp; original text
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="export-mode"
                checked={mode === "summary"}
                onChange={() => setMode("summary")}
              />
              Summaries
            </label>
          </div>
          <p className="text-xs text-ink/55">
            {mode === "transcript"
              ? "Full recording transcripts, uploads, reflections, and session contributions."
              : "CLara-generated summaries. Sessions export their gathering summary when available."}
          </p>
        </fieldset>
      </section>

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

          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium text-ink/55">Element type</span>
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
                <option value="record">Record</option>
                <option value="upload">Upload</option>
                <option value="chat">Chat</option>
                <option value="session">Session</option>
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
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-4 py-3 sm:px-5">
          <p className="text-sm text-ink/70">
            {exportableVisible.length} of {visible.length} visible with{" "}
            {mode === "transcript" ? "transcript" : "summary"} text
            {selectedExportableCount > 0
              ? ` · ${selectedExportableCount} selected`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/80 hover:border-ink/40"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={selectNoneVisible}
              className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/80 hover:border-ink/40"
            >
              Select none
            </button>
            <button
              type="button"
              disabled={isPending || selectedExportableCount === 0}
              onClick={handleExport}
              className="rounded-md bg-forest px-4 py-1.5 text-sm font-medium text-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Preparing…" : "Download Markdown"}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55 sm:px-5">
            No Commons elements match these filters.
          </p>
        ) : (
          <ul className="divide-y divide-cloud">
            {visible.map((item) => {
              const canExport = exportCatalogHasContent(item, mode);
              const checked = selected.has(itemKey(item));
              const colour = colourForElementType(item.elementType);
              const unavailableLabel =
                mode === "transcript"
                  ? "No transcript yet"
                  : "No summary yet";

              return (
                <li key={itemKey(item)}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 border-l-4 px-4 py-3 sm:px-5 ${
                      colour.borderClass
                    } ${canExport ? "hover:bg-sand/60" : "opacity-60"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={!canExport}
                      onChange={() => toggleItem(item)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{item.title}</span>
                        <span className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
                          {exportCatalogTypeLabel(item)}
                        </span>
                        {item.kind === "document" &&
                        item.privacy_status === "private" ? (
                          <span className="rounded bg-cloud px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">
                            Private
                          </span>
                        ) : null}
                        {!canExport ? (
                          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
                            {unavailableLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/45">
                        {formatExportDate(item.created_at)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error ? (
        <p className="font-mono text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-success" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
