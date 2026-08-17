"use client";

import { useMemo, useState } from "react";
import type { RelateTarget } from "@/lib/commons/relate-targets";

const MAX_CONNECTIONS = 8;

type Props = {
  targets: RelateTarget[];
  relatedSessionIds: string[];
  relatedDocumentIds: string[];
  onRelatedSessionIdsChange: (ids: string[]) => void;
  onRelatedDocumentIdsChange: (ids: string[]) => void;
  /** Hide self / nested children so nest and relate stay distinct. */
  excludeIds?: string[];
  helpText?: string;
  disabled?: boolean;
};

/**
 * Searchable Relate picker for edit forms.
 * Why a dedicated field? Add's Connect panel is a popover; edit needs the
 * same choices in the open form so hosts can fix links after the fact.
 */
export function ConnectionsField({
  targets,
  relatedSessionIds,
  relatedDocumentIds,
  onRelatedSessionIdsChange,
  onRelatedDocumentIdsChange,
  excludeIds = [],
  helpText = "Link related sessions or elements. This does not nest.",
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const selectedCount = relatedSessionIds.length + relatedDocumentIds.length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const exclude = new Set(excludeIds);
    return targets.filter((target) => {
      if (exclude.has(target.id)) return false;
      if (!q) return true;
      return (
        target.title.toLowerCase().includes(q) ||
        (target.subtitle?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [targets, query, excludeIds]);

  function isRelated(target: RelateTarget): boolean {
    if (target.kind === "document") {
      return relatedDocumentIds.includes(target.id);
    }
    return relatedSessionIds.includes(target.id);
  }

  function toggle(target: RelateTarget) {
    if (disabled) return;
    if (target.kind === "document") {
      onRelatedDocumentIdsChange(
        relatedDocumentIds.includes(target.id)
          ? relatedDocumentIds.filter((id) => id !== target.id)
          : [...relatedDocumentIds, target.id].slice(0, MAX_CONNECTIONS),
      );
      return;
    }
    onRelatedSessionIdsChange(
      relatedSessionIds.includes(target.id)
        ? relatedSessionIds.filter((id) => id !== target.id)
        : [...relatedSessionIds, target.id].slice(0, MAX_CONNECTIONS),
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink">Connections</span>
      <p className="text-xs text-ink/45">{helpText}</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search sessions and elements…"
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm outline-none focus:border-horizon disabled:opacity-60"
      />
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-cloud bg-sand/20 p-2">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink/45">No matches.</p>
        ) : (
          visible.map((target) => {
            const checked = isRelated(target);
            const atCap = !checked && selectedCount >= MAX_CONNECTIONS;
            return (
              <label
                key={`${target.kind}:${target.id}`}
                className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-sand/40 ${
                  disabled || atCap ? "opacity-40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={disabled || atCap}
                  onChange={() => toggle(target)}
                />
                <span>
                  <span className="font-medium text-ink">{target.title}</span>
                  <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-ink/40">
                    {target.kind}
                    {target.subtitle ? ` · ${target.subtitle}` : ""}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      {selectedCount > 0 ? (
        <p className="text-xs text-ink/50">
          {selectedCount} connected
        </p>
      ) : null}
    </div>
  );
}
