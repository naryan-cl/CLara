"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { retranscribeStreamRecordings } from "@/app/(app)/admin/actions";
import type { RetranscribeCandidate } from "@/lib/listens/list-retranscribable";

/**
 * Admin: queue a fresh Whisper/diarize pass for recordings that still have
 * original audio. Improves speaker turns after formatter changes.
 */
export function RetranscribePanel({
  candidates,
  inProgress,
  withoutMeta,
  listError,
}: {
  candidates: RetranscribeCandidate[];
  inProgress: number;
  withoutMeta: number;
  listError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function onRetranscribe() {
    if (candidates.length === 0) return;
    const confirmed = window.confirm(
      `Re-transcribe ${candidates.length} recording${candidates.length === 1 ? "" : "s"}?\n\n` +
        "Current transcript text and summaries will be replaced until Whisper finishes. Original audio is kept. This uses OpenAI minutes (about $0.006 per minute of audio).",
    );
    if (!confirmed) return;

    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await retranscribeStreamRecordings();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const extra: string[] = [];
      if (result.skippedNoAudio > 0) {
        extra.push(
          `${result.skippedNoAudio} had no original audio left in storage`,
        );
      }
      if (result.skippedInProgress > 0) {
        extra.push(`${result.skippedInProgress} already transcribing`);
      }
      if (result.skippedOther > 0) {
        extra.push(`${result.skippedOther} could not start`);
      }
      setNote(
        result.queued === 0
          ? extra.length > 0
            ? `Nothing queued (${extra.join("; ")}).`
            : "Nothing to queue."
          : `Queued ${result.queued} recording${result.queued === 1 ? "" : "s"}. Keep Inngest running until jobs finish.${extra.length ? ` Skipped: ${extra.join("; ")}.` : ""}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink/60">
        After a transcription-quality change, re-run Whisper on recordings that
        still have original audio. Each item shows{" "}
        <span className="font-medium text-ink/80">Transcribing…</span> then a
        new Summary. Recordings without stored audio cannot be rebuilt here —
        open them and Edit, or upload again.
      </p>

      {listError ? (
        <p className="font-mono text-sm text-danger">{listError}</p>
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
            {candidates.length} ready to re-run
            {inProgress > 0 ? ` · ${inProgress} already in progress` : ""}
            {withoutMeta > 0
              ? ` · ${withoutMeta} with no stored audio pointer`
              : ""}
          </p>
          {candidates.length === 0 ? (
            <p className="text-sm text-ink/60">
              No recordings with retry info are waiting. Failed or finished
              takes that still have audio will appear here.
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col gap-2 overflow-auto">
              {candidates.map((doc) => (
                <li key={doc.documentId} className="text-sm text-ink">
                  <Link
                    href={`/sessions/documents/${doc.documentId}`}
                    className="text-horizon hover:underline"
                  >
                    {doc.title?.trim() || "Untitled recording"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {note ? <p className="text-sm text-forest">{note}</p> : null}

      <button
        type="button"
        onClick={onRetranscribe}
        disabled={pending || Boolean(listError) || candidates.length === 0}
        className="btn-primary w-fit bg-forest px-4 py-2 text-sm font-medium text-paper ring-1 ring-glow/30 disabled:opacity-60"
      >
        {pending ? "Queueing…" : "Re-transcribe recordings"}
      </button>
    </div>
  );
}
