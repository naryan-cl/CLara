"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveSessionEdits } from "@/app/(app)/sessions/session-edit-actions";
import type { SessionSummary } from "@/lib/sessions/types";

function dateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

/**
 * Compact session metadata form. Parent owns the pencil (dashboard Ask host).
 */
export function SessionEditor({
  session,
  forceEditing = false,
  onCancelEditing,
  onSaved,
}: {
  session: SessionSummary;
  forceEditing?: boolean;
  onCancelEditing?: () => void;
  onSaved?: (session: SessionSummary) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [session.id, forceEditing]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveSessionEdits(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved?.(result.session);
      onCancelEditing?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={session.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium text-ink">
          Edit session
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              onCancelEditing?.();
            }}
            className="rounded-md border border-cloud px-4 py-2 text-sm text-ink/70"
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title</span>
        <input
          name="name"
          required
          defaultValue={session.name}
          placeholder="Morning circle"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Date</span>
        <input
          type="date"
          name="occurredAt"
          defaultValue={dateInputValue(session.occurred_at)}
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Inquiry</span>
        <textarea
          name="seedQuestion"
          rows={3}
          defaultValue={session.seed_question ?? ""}
          placeholder="What are we gathering around?"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={session.description ?? ""}
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
    </form>
  );
}
