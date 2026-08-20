"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { requestCommonGroundReport } from "@/app/(app)/common-ground/actions";
import { HelpTip } from "@/components/HelpTip";
import type { SessionSummary } from "@/lib/sessions/types";

export function CommonGroundPanel({
  sessions,
}: {
  sessions: SessionSummary[];
}) {
  const finalized = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.finalized_at &&
          (session.synthesis_document_id || session.finalized_at),
      ),
    [sessions],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(finalized.map((s) => s.id)));
  }

  function handleGenerate() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await requestCommonGroundReport([...selected]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-ink">Select gatherings</p>
          <HelpTip description="Choose two or more Finalized sessions. CLara reads each gathering synthesis and structured contribution briefs, then writes one cross-session Common Ground report into the Commons." />
        </div>
        <p className="mt-1 text-xs text-ink/55">
          {finalized.length} finalized session
          {finalized.length === 1 ? "" : "s"} available.
        </p>

        {finalized.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60">
            No finalized sessions yet. Host a Session, collect contributions,
            then Finalize before generating Common Ground.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-cloud rounded border border-cloud">
            {finalized.map((session) => (
              <li key={session.id}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-sand/60">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(session.id)}
                    onChange={() => toggle(session.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{session.name}</span>
                    {session.seed_question ? (
                      <span className="mt-0.5 block text-xs text-ink/55">
                        {session.seed_question}
                      </span>
                    ) : null}
                    {session.synthesis_document_id ? (
                      <span className="mt-1 inline-block rounded-pill bg-sage/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-forest">
                        Synthesis ready
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAll}
            disabled={finalized.length === 0}
            className="rounded-md border border-cloud px-3 py-1.5 text-sm text-ink/80 hover:border-ink/40 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={pending || selected.size < 2}
            onClick={handleGenerate}
            className="rounded-md bg-forest px-4 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {pending ? "Starting…" : "Generate Common Ground"}
          </button>
        </div>

        {message ? (
          <p className="mt-3 text-sm text-forest">{message}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </section>

      <p className="text-sm text-ink/55">
        Reports appear in{" "}
        <Link href="/commons" className="text-horizon hover:underline">
          Commons
        </Link>{" "}
        as Summary documents tagged cross-session. Ask CLara can query them
        after indexing completes.
      </p>
    </div>
  );
}
