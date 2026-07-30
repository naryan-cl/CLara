"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDocumentEdits } from "@/app/(app)/sessions/documents/actions";
import type { CommonsDocument } from "@/lib/documents/types";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MarkdownView } from "@/components/MarkdownView";

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

export function DocumentEditor({ document }: { document: CommonsDocument }) {
  const tags = asStringList(document.tags);
  const participants = asStringList(document.participants);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [contentMarkdown, setContentMarkdown] = useState(document.content);

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
            <h1 className="mt-1 font-display text-2xl font-medium text-ink">
              {document.title?.trim() || "Untitled"}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-ink/40">
              Updated {new Date(document.updated_at).toLocaleString()}
              {document.session_id ? ` · session ${document.session_id}` : ""}
            </p>
          </div>
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
        <span className="font-medium text-ink">Session ID (optional)</span>
        <input
          name="sessionId"
          defaultValue={document.session_id ?? ""}
          placeholder="e.g. morning-circle-1"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
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
