"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { askClara, type AskSource } from "@/app/(app)/ask/actions";

export function AskForm() {
  const [pending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    setError(null);

    if (!trimmed) {
      setError("Ask something first.");
      return;
    }

    startTransition(async () => {
      const result = await askClara(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAnswer(result.answer);
      setSources(result.sources);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
      >
        <label
          htmlFor="ask-question"
          className="font-mono text-[11px] uppercase tracking-wide text-ink/60"
        >
          Ask the Camp CLAI Commons
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="What came up around psychological safety this week?"
          className="rounded-md border border-cloud bg-sand/40 p-3 text-sm text-ink outline-none focus:border-horizon"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-60"
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>

      {answer && (
        <div className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
            {answer}
          </p>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-cloud pt-4">
              {sources.map((source, index) => (
                <Link
                  key={source.documentId}
                  href={`/sessions/documents/${source.documentId}`}
                  className="rounded-pill border border-cloud bg-sand/60 px-3 py-1 text-xs text-ink/80 hover:border-horizon hover:text-horizon"
                >
                  [{index + 1}] {source.title}
                  {source.sessionName ? ` · ${source.sessionName}` : ""}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
