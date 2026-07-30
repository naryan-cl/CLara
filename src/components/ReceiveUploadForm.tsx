"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { receiveTextFile } from "@/app/(app)/sessions/actions";

const TYPE_OPTIONS = [
  "Note",
  "Reflection",
  "Transcript",
  "Summary",
  "Concept",
  "Framework",
  "Theme",
] as const;

export function ReceiveUploadForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await receiveTextFile(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(
        result.needsReview
          ? "Received — saved with needs_review (missing OKF fields)."
          : "Received — saved to the Camp CLAI Commons.",
      );
      form.reset();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
    >
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          CLara Receives
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Upload a <span className="font-mono">.md</span> or{" "}
          <span className="font-mono">.txt</span> note into this stream&apos;s
          Commons. Audio arrives later via CLara Listens.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">File</span>
        <input
          type="file"
          name="file"
          accept=".md,.txt,text/markdown,text/plain"
          required
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink file:mr-3 file:rounded-md file:border-0 file:bg-forest file:px-3 file:py-1.5 file:text-sm file:text-paper"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title (optional)</span>
        <input
          type="text"
          name="title"
          placeholder="Defaults from the file name"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">OKF type</span>
        <select
          name="type"
          defaultValue="Note"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        >
          {TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-60"
      >
        {pending ? "Receiving…" : "Receive into Commons"}
      </button>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
    </form>
  );
}
