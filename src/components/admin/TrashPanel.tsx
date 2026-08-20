"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreTrashItemAction } from "@/app/(app)/admin/actions";
import type { TrashItem } from "@/lib/trash/types";

/**
 * Admin list of soft-deleted Commons documents and sessions, with Restore.
 */
export function TrashPanel({
  items,
  listError,
}: {
  items: TrashItem[];
  listError: string | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function onRestore(item: TrashItem) {
    setError(null);
    setNote(null);
    setPendingId(item.id);
    startTransition(async () => {
      const result = await restoreTrashItemAction(item.kind, item.id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(result.note ?? `Restored “${item.title}”.`);
      router.refresh();
    });
  }

  if (listError) {
    return <p className="font-mono text-sm text-danger">{listError}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink/60">
        Delete in Commons or Edit moves items here instead of erasing them.
        Comments, summaries, and original Record audio come back with Restore.
      </p>

      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
      {note ? <p className="text-sm text-forest">{note}</p> : null}

      {items.length === 0 ? (
        <p className="text-sm text-ink/60">Trash is empty.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const busy = pending && pendingId === item.id;
            return (
              <li
                key={`${item.kind}:${item.id}`}
                className="flex flex-col items-stretch gap-3 border-b border-cloud pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.title}
                  </p>
                  <p className="font-mono text-[11px] text-ink/40">
                    {item.itemType}
                    {item.nestedIn ? ` · nested in ${item.nestedIn}` : ""}
                    {" · "}
                    {new Date(item.deletedAt).toLocaleString()}
                    {item.deletedByName ? ` · ${item.deletedByName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRestore(item)}
                  className="min-h-11 shrink-0 rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink hover:border-ink/40 disabled:opacity-60"
                >
                  {busy ? "Restoring…" : "Restore"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
