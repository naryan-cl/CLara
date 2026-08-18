"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  deleteSessionAction,
  saveSessionEdits,
} from "@/app/(app)/sessions/session-edit-actions";
import { ConnectionsField } from "@/components/ConnectionsField";
import { HelpTip } from "@/components/HelpTip";
import { SessionDeleteDialog } from "@/components/SessionDeleteDialog";
import type { RelateTarget } from "@/lib/commons/relate-targets";
import type { CommonsDocument } from "@/lib/documents/types";
import type { DeleteSessionMode } from "@/lib/sessions/delete-session";
import {
  SESSION_HIGHLIGHT_COLORS,
  SESSION_HIGHLIGHTS,
  type SessionHighlightColor,
} from "@/lib/sessions/highlight";
import type { SessionSummary } from "@/lib/sessions/types";

function dateInputValue(value: string | null): string {
  if (!value) return "";
  // Postgres `date` columns arrive as YYYY-MM-DD — keep that calendar day.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compact session metadata form. Parent owns the pencil (dashboard Ask host).
 * Delete sits next to Save — same people as edit (host, attendees, admins).
 */
export function SessionEditor({
  session,
  forceEditing = false,
  onCancelEditing,
  onSaved,
  relateTargets = [],
  relatedSessionIds: initialRelatedSessionIds = [],
  relatedDocumentIds: initialRelatedDocumentIds = [],
  nestedDocuments = [],
  canEdit = true,
  onDeleted,
}: {
  session: SessionSummary;
  forceEditing?: boolean;
  onCancelEditing?: () => void;
  onSaved?: (session: SessionSummary) => void;
  relateTargets?: RelateTarget[];
  relatedSessionIds?: string[];
  relatedDocumentIds?: string[];
  nestedDocuments?: CommonsDocument[];
  canEdit?: boolean;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedSessionIds, setRelatedSessionIds] = useState(
    initialRelatedSessionIds,
  );
  const [relatedDocumentIds, setRelatedDocumentIds] = useState(
    initialRelatedDocumentIds,
  );
  const [highlightColor, setHighlightColor] = useState<
    SessionHighlightColor | ""
  >(session.highlight_color ?? "");

  useEffect(() => {
    setError(null);
    setConfirmDelete(false);
    setRelatedSessionIds(initialRelatedSessionIds);
    setRelatedDocumentIds(initialRelatedDocumentIds);
    setHighlightColor(session.highlight_color ?? "");
    // Reset when the session (or pencil) changes, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, forceEditing]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("relatedSessionIds", relatedSessionIds.join(","));
    formData.set("relatedDocumentIds", relatedDocumentIds.join(","));

    setBusyAction("save");
    startTransition(async () => {
      const result = await saveSessionEdits(formData);
      setBusyAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved?.(result.session);
      onCancelEditing?.();
      router.refresh();
    });
  }

  function onConfirmDelete(mode: DeleteSessionMode) {
    setError(null);
    setBusyAction("delete");
    startTransition(async () => {
      const result = await deleteSessionAction(session.id, mode);
      setBusyAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmDelete(false);
      if (onDeleted) {
        onDeleted();
      } else {
        router.push("/commons");
      }
      router.refresh();
    });
  }

  const nestedIds = nestedDocuments.map((doc) => doc.id);

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={session.id} />
        <input type="hidden" name="highlightColor" value={highlightColor} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-medium text-ink">
            Edit session
          </h2>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmDelete(true);
                }}
                className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
                disabled={pending}
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirmDelete(false);
                onCancelEditing?.();
              }}
              className="rounded-md border border-cloud px-4 py-2 text-sm text-ink/70"
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !canEdit}
              className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
            >
              {pending && busyAction === "save" ? "Saving…" : "Save"}
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
            defaultValue={dateInputValue(
              session.occurred_at || session.created_at,
            )}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          />
        </label>

        {session.join_code ? (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Join code</span>
            <p className="font-mono tracking-widest text-ink">
              {session.join_code}
            </p>
            <p className="text-xs text-ink/45">
              Change the code or copy share links on the{" "}
              <Link
                href={`/add/session?id=${session.id}`}
                className="text-horizon hover:underline"
              >
                live board
              </Link>
              .
            </p>
          </div>
        ) : null}

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
            placeholder=""
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="flex items-center gap-1.5 text-sm font-medium text-ink">
            Highlight
            <HelpTip description="A quiet colour mark in Commons, dashboard, and archive lists so you can find this gathering later. It does not change the map." />
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHighlightColor("")}
              disabled={!canEdit}
              aria-pressed={highlightColor === ""}
              aria-label="No highlight"
              title="None"
              className={`flex h-8 w-8 items-center justify-center rounded-full border bg-sand text-xs text-ink/45 ${
                highlightColor === ""
                  ? "border-ink/50 ring-2 ring-ink/20 ring-offset-2 ring-offset-paper"
                  : "border-cloud hover:border-ink/30"
              }`}
            >
              —
            </button>
            {SESSION_HIGHLIGHT_COLORS.map((color) => {
              const spec = SESSION_HIGHLIGHTS[color];
              const selected = highlightColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setHighlightColor(color)}
                  disabled={!canEdit}
                  aria-pressed={selected}
                  aria-label={spec.label}
                  title={spec.label}
                  className={`h-8 w-8 rounded-full ${spec.swatchClass} ${
                    selected
                      ? "ring-2 ring-ink/40 ring-offset-2 ring-offset-paper"
                      : "opacity-80 hover:opacity-100"
                  }`}
                />
              );
            })}
          </div>
        </fieldset>

        <ConnectionsField
          targets={relateTargets}
          relatedSessionIds={relatedSessionIds}
          relatedDocumentIds={relatedDocumentIds}
          onRelatedSessionIdsChange={setRelatedSessionIds}
          onRelatedDocumentIdsChange={setRelatedDocumentIds}
          excludeIds={[session.id, ...nestedIds]}
          disabled={!canEdit}
          helpText="Link this gathering to other sessions or stand-alone elements. Nested Adds already live inside this session."
        />

        {error && !confirmDelete ? (
          <p className="font-mono text-sm text-danger">{error}</p>
        ) : null}
      </form>

      {confirmDelete ? (
        <SessionDeleteDialog
          sessionName={session.name}
          nestedDocuments={nestedDocuments}
          pending={pending && busyAction === "delete"}
          error={error}
          onCancel={() => {
            if (pending) return;
            setConfirmDelete(false);
            setError(null);
          }}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </>
  );
}
