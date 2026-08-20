"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryListensTranscription } from "@/app/(app)/sessions/listens-actions";
import type { CommonsDocument } from "@/lib/documents/types";
import { parseListensJobMeta } from "@/lib/listens/job-meta";
import {
  recordingProcessStatus,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";

/**
 * Retry failed Whisper, or re-run a finished transcript when original audio
 * is still linked (improved speaker turns).
 */
export function TranscriptRetryBar({
  document,
  canEdit,
  onRetried,
}: {
  document: CommonsDocument;
  canEdit: boolean;
  onRetried?: (next: {
    document: CommonsDocument;
    processStatus: RecordingProcessStatus;
  }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = recordingProcessStatus(document);
  const hasMeta = Boolean(parseListensJobMeta(document.content));
  const failed = status === "failed";
  const canRerun =
    hasMeta &&
    (failed || status === "ready" || status === "needs_review");

  if (!canRerun) return null;

  function run() {
    if (
      !failed &&
      !window.confirm(
        "Re-transcribe this recording? The current transcript and summary will be replaced until Whisper finishes. Original audio is kept.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await retryListensTranscription(document.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRetried?.({
        document: result.document,
        processStatus: result.processStatus,
      });
      router.refresh();
    });
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-3">
        <p className="text-sm text-ink/75">
          Transcription never finished. The original recording is kept — listen
          below, then Retry Whisper.
        </p>
        {canEdit ? (
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className="self-start rounded-md bg-forest px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-60"
          >
            {pending ? "Retrying…" : "Retry transcription"}
          </button>
        ) : null}
        {error ? (
          <p className="font-mono text-sm text-danger">{error}</p>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-cloud bg-sand/30 px-3 py-3">
      <p className="text-sm text-ink/70">
        Original audio is still saved. Re-transcribe to pick up improved
        speaker turns and timestamps. This replaces the current transcript and
        summary.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="self-start rounded-md border border-cloud bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:border-horizon disabled:opacity-60"
      >
        {pending ? "Starting…" : "Re-transcribe"}
      </button>
      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
    </div>
  );
}
