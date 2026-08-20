"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type NestedDocSummary = {
  id: string;
  title: string | null;
  type: string | null;
};

/**
 * Confirm session delete. Nested Commons docs can stay (ungrouped) or go too.
 * Portaled to body so Commons popup overflow / transform cannot clip it.
 */
export function SessionDeleteDialog({
  sessionName,
  nestedDocuments,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  sessionName: string;
  nestedDocuments: NestedDocSummary[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (mode: "ungroup" | "delete-nested") => void;
}) {
  const count = nestedDocuments.length;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Cancel delete"
        onClick={onCancel}
        disabled={pending}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-delete-title"
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-cloud bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-soft sm:rounded-lg sm:pb-5"
      >
        <h2
          id="session-delete-title"
          className="font-display text-xl font-medium text-ink"
        >
          Delete “{sessionName}”?
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          The session moves to Admin → Trash. An admin can restore it later.
          Join links stop working until it is restored.
        </p>

        {count === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            This session has no nested Commons documents.
          </p>
        ) : (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">
              Nested documents ({count})
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-cloud bg-sand/40 px-3 py-2">
              {nestedDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-baseline justify-between gap-2 py-1 text-sm"
                >
                  <span className="truncate text-ink">
                    {doc.title?.trim() || "Untitled"}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink/40">
                    {doc.type ?? "untyped"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error ? (
          <p className="mt-3 font-mono text-sm text-danger">{error}</p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 rounded-md border border-cloud px-4 py-2 text-sm text-ink/70 disabled:opacity-60"
          >
            Cancel
          </button>
          {count > 0 ? (
            <>
              <button
                type="button"
                onClick={() => onConfirm("ungroup")}
                disabled={pending}
                className="rounded-md border border-cloud px-4 py-2 text-sm font-medium text-ink disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Keep documents (ungroup)"}
              </button>
              <button
                type="button"
                onClick={() => onConfirm("delete-nested")}
                disabled={pending}
                className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete session and documents"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm("ungroup")}
              disabled={pending}
              className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete session"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
