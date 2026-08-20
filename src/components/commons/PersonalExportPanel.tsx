"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { exportPersonalSelection } from "@/app/(app)/commons/export/actions";
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

export function PersonalExportPanel({
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
  const [mode, setMode] = useState<ExportContentMode>("structured");
  const [filters, setFilters] = useState<CommonsFilterState>(
    DEFAULT_COMMONS_FILTERS,
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(
    () =>
      filterCommonsItems(items, filters, currentUserId) as ExportCatalogItem[],
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

  function selectAttendedSessions() {
    setFilters((prev) => ({ ...prev, attendedOnly: true }));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of visible) {
        if (
          item.kind === "session" &&
          item.attending &&
          exportCatalogHasContent(item, mode)
        ) {
          next.add(itemKey(item));
        }
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
      const result = await exportPersonalSelection({
        documentIds,
        sessionIds,
        mode,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      downloadMarkdown(
        exportFilename(`${streamSlug}-my`, mode),
        result.markdown,
      );

      setMessage(
        `Downloaded ${result.exported} element${result.exported === 1 ? "" : "s"}.`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-ink/55">
          <Link
            href="/commons"
            className="text-horizon underline-offset-2 hover:underline"
          >
            Commons
          </Link>
          <span className="mx-1.5 text-ink/30">/</span>
          Export my harvest
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Export my harvest
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Download Markdown from sessions you attended or hosted, plus your own
          artifacts in {streamName}. Structured briefs work well with NotebookLM.
        </p>
      </div>

      <div
        className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-ink/80"
        role="note"
      >
        <p className="font-medium text-ink">Privacy reminder</p>
        <p className="mt-1">
          Exports may include other participants&apos; speech and reflections
          from sessions you attended. Do not commit downloaded files to this
          public repo. Uploading to external tools shares the content with that
          provider.
        </p>
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Export content</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="personal-export-mode"
                checked={mode === "structured"}
                onChange={() => setMode("structured")}
              />
              Structured briefs
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="personal-export-mode"
                checked={mode === "summary"}
                onChange={() => setMode("summary")}
              />
              Summaries
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="personal-export-mode"
                checked={mode === "transcript"}
                onChange={() => setMode("transcript")}
              />
              Transcripts
            </label>
          </div>
        </fieldset>
      </section>

      <section className="rounded-lg border border-cloud bg-paper shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud px-4 py-3 sm:px-5">
          <p className="text-sm text-ink/70">
            {exportableVisible.length} exportable · {selectedExportableCount}{" "}
            selected
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAttendedSessions}
              className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/80 hover:border-ink/40"
            >
              Attended sessions
            </button>
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/80 hover:border-ink/40"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={isPending || selectedExportableCount === 0}
              onClick={handleExport}
              className="rounded-md bg-forest px-4 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              {isPending ? "Preparing…" : "Download Markdown"}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55 sm:px-5">
            No attended sessions or personal artifacts to export yet.
          </p>
        ) : (
          <ul className="divide-y divide-cloud">
            {visible.map((item) => {
              const canExport = exportCatalogHasContent(item, mode);
              const checked = selected.has(itemKey(item));
              const colour = colourForElementType(item.elementType);

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
                      <span className="font-medium text-ink">{item.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink/45">
                        {exportCatalogTypeLabel(item)} ·{" "}
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

      {message ? <p className="text-sm text-forest">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
