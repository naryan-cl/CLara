"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveDocumentEdits } from "@/app/(app)/sessions/documents/actions";
import type { CommonsDocument } from "@/lib/documents/types";
import type { SessionSummary } from "@/lib/sessions/types";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownView } from "@/components/MarkdownView";

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

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

export function DocumentEditor({
  document,
  sessions,
  canEdit = true,
  compact = false,
  hideEditButton = false,
  forceEditing = false,
  onCancelEditing,
}: {
  document: CommonsDocument;
  sessions: SessionSummary[];
  /** Author, session attendees, or admins — hide Edit when false. */
  canEdit?: boolean;
  /** Smaller headings for use inside the Commons popup. */
  compact?: boolean;
  /** Parent owns the Edit affordance (e.g. dashboard Ask host pencil). */
  hideEditButton?: boolean;
  /** Open directly in the edit form (dashboard pencil toggle). */
  forceEditing?: boolean;
  /** Called when Cancel leaves edit mode while forceEditing was set. */
  onCancelEditing?: () => void;
}) {
  const tags = asStringList(document.tags);
  const participants = asStringList(document.participants);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(forceEditing);
  const [contentMarkdown, setContentMarkdown] = useState(document.content);
  const [sessionChoice, setSessionChoice] = useState(
    document.session_id ?? "",
  );
  const currentSessionName = sessions.find(
    (s) => s.id === document.session_id,
  )?.name;

  // Parent pencil can flip forceEditing on; stay in sync.
  useEffect(() => {
    if (forceEditing) {
      setContentMarkdown(document.content);
      setEditing(true);
      setMessage(null);
      setError(null);
    }
  }, [forceEditing, document.content, document.id]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("content", contentMarkdown);

    startTransition(async () => {
      const result = await saveDocumentEdits(formData);
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

  if (!editing) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
              {document.type ?? "untyped"}
              {document.needs_review ? " · needs review" : ""}
              {" · "}
              {document.privacy_status}
            </p>
            {compact ? (
              <h2 className="mt-1 font-display text-xl font-medium text-ink">
                {document.title?.trim() || "Untitled"}
              </h2>
            ) : (
              <h1 className="mt-1 font-display text-2xl font-medium text-ink">
                {document.title?.trim() || "Untitled"}
              </h1>
            )}
            <p className="mt-1 font-mono text-[11px] text-ink/40">
              Updated {new Date(document.updated_at).toLocaleString()}
              {currentSessionName ? ` · session ${currentSessionName}` : ""}
            </p>
          </div>
          {canEdit && !hideEditButton ? (
            <button
              type="button"
              onClick={() => {
                setContentMarkdown(document.content);
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

        {tags.length > 0 || participants.length > 0 ? (
          <div className="flex flex-wrap gap-4 text-xs">
            {tags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono uppercase tracking-wide text-ink/40">
                  Tags
                </span>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill bg-cloud px-2.5 py-1 text-ink/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {participants.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono uppercase tracking-wide text-ink/40">
                  Participants
                </span>
                {participants.map((person) => (
                  <span
                    key={person}
                    className="rounded-pill border border-sage/40 px-2.5 py-1 text-sage"
                  >
                    {person}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <article className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <MarkdownView markdown={document.content} />
        </article>

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
        <h1 className="font-display text-2xl font-medium text-ink">
          Edit document
        </h1>
        <div className="flex gap-2">
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
            {pending ? "Saving…" : "Save"}
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Session (optional)</span>
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

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Content</span>
        <MarkdownEditor
          key={document.id + document.updated_at}
          initialMarkdown={document.content}
          onChangeMarkdown={setContentMarkdown}
          minHeightClassName="min-h-[280px]"
        />
      </div>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
    </form>
  );
}
