"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  deleteDocumentAction,
  saveDocumentEdits,
} from "@/app/(app)/sessions/documents/actions";
import type { CommonsDocument } from "@/lib/documents/types";
import type { RelateTarget } from "@/lib/commons/relate-targets";
import type { SessionSummary } from "@/lib/sessions/types";
import { ConnectionsField } from "@/components/ConnectionsField";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { DocumentReadView } from "@/components/commons/ElementReadView";
import { stripListensJobMeta } from "@/lib/listens/job-meta";

const NEW_SESSION_VALUE = "__new__";

const TYPE_OPTIONS = [
  "Note",
  "Reflection",
  "Transcript",
  "Summary",
  "Atom",
  "Concept",
  "Framework",
  "Theme",
] as const;

export function DocumentEditor({
  document,
  sessions,
  canEdit = true,
  compact = false,
  hideEditButton = false,
  forceEditing = false,
  createdByName = null,
  attendeeNames = [],
  onCancelEditing,
  onDeleted,
  relateTargets = [],
  relatedSessionIds: initialRelatedSessionIds = [],
  relatedDocumentIds: initialRelatedDocumentIds = [],
}: {
  document: CommonsDocument;
  sessions: SessionSummary[];
  /** Author, session attendees, or admins — hide Edit / Delete when false. */
  canEdit?: boolean;
  /** Smaller headings for use inside the Commons popup. */
  compact?: boolean;
  /** Parent owns the Edit affordance (e.g. dashboard Ask host pencil). */
  hideEditButton?: boolean;
  /** Open directly in the edit form (dashboard pencil toggle). */
  forceEditing?: boolean;
  createdByName?: string | null;
  attendeeNames?: string[];
  /** Called when Cancel leaves edit mode while forceEditing was set. */
  onCancelEditing?: () => void;
  /** Called after a successful delete (parent closes popup / clears selection). */
  onDeleted?: () => void;
  relateTargets?: RelateTarget[];
  relatedSessionIds?: string[];
  relatedDocumentIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"save" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(forceEditing);
  const [contentMarkdown, setContentMarkdown] = useState(
    stripListensJobMeta(document.content),
  );
  const [sessionChoice, setSessionChoice] = useState(
    document.session_id ?? "",
  );
  const [relatedSessionIds, setRelatedSessionIds] = useState(
    initialRelatedSessionIds,
  );
  const [relatedDocumentIds, setRelatedDocumentIds] = useState(
    initialRelatedDocumentIds,
  );
  const currentSessionName = sessions.find(
    (s) => s.id === document.session_id,
  )?.name;

  // Parent pencil can flip forceEditing on; stay in sync.
  useEffect(() => {
    if (forceEditing) {
      setContentMarkdown(stripListensJobMeta(document.content));
      setEditing(true);
      setMessage(null);
      setError(null);
      setRelatedSessionIds(initialRelatedSessionIds);
      setRelatedDocumentIds(initialRelatedDocumentIds);
    }
    // Connection lists come from the loaded detail; reset on document/pencil only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceEditing, document.content, document.id]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("content", contentMarkdown);
    formData.set("relatedSessionIds", relatedSessionIds.join(","));
    formData.set("relatedDocumentIds", relatedDocumentIds.join(","));

    setBusyAction("save");
    startTransition(async () => {
      const result = await saveDocumentEdits(formData);
      setBusyAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Saved.");
      setEditing(false);
      onCancelEditing?.();
      router.refresh();
    });
  }

  function onDelete() {
    const title = document.title?.trim() || "Untitled";
    const confirmed = window.confirm(
      `Delete “${title}”? It will move to Admin → Trash, where an admin can restore it.`,
    );
    if (!confirmed) return;

    setMessage(null);
    setError(null);
    setBusyAction("delete");

    startTransition(async () => {
      const result = await deleteDocumentAction(document.id);
      setBusyAction(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onDeleted) {
        onDeleted();
      } else {
        router.push("/commons");
      }
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-mono text-[11px] text-ink/40">
            Updated {new Date(document.updated_at).toLocaleString()}
            {currentSessionName ? ` · session ${currentSessionName}` : ""}
          </p>
          {canEdit && !hideEditButton ? (
            <button
              type="button"
              onClick={() => {
                setContentMarkdown(stripListensJobMeta(document.content));
                setRelatedSessionIds(initialRelatedSessionIds);
                setRelatedDocumentIds(initialRelatedDocumentIds);
                setEditing(true);
                setMessage(null);
                setError(null);
              }}
              className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
            >
              Edit
            </button>
          ) : null}
        </div>

        <DocumentReadView
          document={document}
          createdByName={createdByName}
          attendeeNames={attendeeNames}
          hideTitle={false}
          canEdit={canEdit}
        />

        {message ? (
          <p className="text-sm text-success">{message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={document.id} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`font-display font-medium text-ink ${compact ? "text-xl" : "text-2xl"}`}>
          Edit document
        </h1>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
              disabled={pending}
            >
              {pending && busyAction === "delete" ? "Deleting…" : "Delete"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setEditing(false);
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
            {pending && busyAction === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title</span>
        <input
          name="title"
          defaultValue={document.title ?? ""}
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Type</span>
          <select
            name="type"
            defaultValue={document.type ?? "Note"}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Privacy</span>
          <select
            name="privacyStatus"
            defaultValue={document.privacy_status}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          >
            <option value="public">Public Commons</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="isExternal"
          defaultChecked={Boolean(document.is_external)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-cloud accent-forest"
        />
        <span className="font-medium text-ink">This is from outside CL</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Nested in session</span>
        <p className="text-xs text-ink/45">
          Use if this Add is a part of a larger session.
        </p>
        <select
          name="sessionId"
          value={sessionChoice}
          onChange={(e) => setSessionChoice(e.target.value)}
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        >
          <option value="">— none —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SESSION_VALUE}>+ New session…</option>
        </select>
        {sessionChoice === NEW_SESSION_VALUE ? (
          <input
            name="newSessionName"
            placeholder="Session name, e.g. Morning Circle 1"
            autoFocus
            className="mt-2 rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          />
        ) : null}
      </label>

      <ConnectionsField
        targets={relateTargets}
        relatedSessionIds={relatedSessionIds}
        relatedDocumentIds={relatedDocumentIds}
        onRelatedSessionIdsChange={setRelatedSessionIds}
        onRelatedDocumentIdsChange={setRelatedDocumentIds}
        excludeIds={[
          document.id,
          ...(sessionChoice && sessionChoice !== NEW_SESSION_VALUE
            ? [sessionChoice]
            : []),
        ]}
        helpText="Connect to another session or element without nesting."
      />

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Content</span>
        <MarkdownEditor
          key={document.id + document.updated_at}
          initialMarkdown={document.content}
          onChangeMarkdown={setContentMarkdown}
          minHeightClassName={compact ? "min-h-[160px]" : "min-h-[280px]"}
        />
      </div>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
    </form>
  );
}
