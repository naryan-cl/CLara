"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  askClara,
  type AskHistoryMessage,
  type AskSource,
} from "@/app/(app)/ask/actions";

type AskTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: AskSource[];
};

/**
 * Ask CLara UI with in-session follow-ups.
 * Kept separate from ChatForm / Chatbot — different action, prompt, and RAG.
 */
export function AskForm() {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    setError(null);

    if (!trimmed) {
      setError("Ask something first.");
      return;
    }

    const historyForServer: AskHistoryMessage[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));

    startTransition(async () => {
      const result = await askClara(trimmed, historyForServer);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTurns((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        },
      ]);
      setDraft("");
    });
  }

  function onClear() {
    setTurns([]);
    setError(null);
    setDraft("");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
    >
      <div className="flex flex-col gap-4">
        {turns.length === 0 ? (
          <p className="text-sm text-ink/50">
            Ask anything about this stream&apos;s Commons. You can follow up in
            this thread — answers stay grounded in sources, separate from Chat.
          </p>
        ) : (
          turns.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={
                turn.role === "user"
                  ? "ml-8 rounded-md bg-sand/60 px-3 py-2 text-sm text-ink"
                  : "mr-4 flex flex-col gap-3"
              }
            >
              {turn.role === "assistant" ? (
                <p className="font-mono text-[10px] uppercase tracking-wide text-ink/40">
                  CLARA
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
                {turn.content}
              </p>
              {turn.role === "assistant" &&
              turn.sources &&
              turn.sources.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-cloud pt-3">
                  {turn.sources.map((source, sourceIndex) => (
                    <Link
                      key={`${source.documentId}-${sourceIndex}`}
                      href={`/sessions/documents/${source.documentId}`}
                      className="rounded-pill border border-horizon/40 bg-sand/60 px-3 py-1 font-mono text-[11px] text-horizon hover:border-horizon"
                    >
                      [{sourceIndex + 1}] {source.title}
                      {source.sessionName ? ` · ${source.sessionName}` : ""}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        {pending ? (
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
            CLara is thinking…
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-cloud pt-4">
        <label
          htmlFor="ask-question"
          className={
            turns.length === 0
              ? "sr-only"
              : "font-mono text-[11px] uppercase tracking-wide text-ink/60"
          }
        >
          {turns.length === 0
            ? "Ask a question"
            : "Follow up (same grounded thread)"}
        </label>
        <textarea
          id="ask-question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder={
            turns.length === 0
              ? "What came up around psychological safety this week?"
              : "Can you say more about that?"
          }
          className="rounded-md border border-cloud bg-sand/40 p-3 text-sm text-ink outline-none focus:border-horizon"
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-60"
          >
            {pending ? "Asking…" : turns.length === 0 ? "Ask" : "Ask follow-up"}
          </button>
          {turns.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              className="rounded-md border border-cloud px-4 py-2 text-sm text-ink/70 hover:text-ink disabled:opacity-60"
            >
              Clear thread
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
