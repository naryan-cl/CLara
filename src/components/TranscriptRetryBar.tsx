"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryListensTranscription } from "@/app/(app)/sessions/listens-actions";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  recordingProcessStatus,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";

/**
 * Retry Whisper for a failed / stale Transcript. Parent refreshes after success.
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

  if (recordingProcessStatus(document) !== "failed") {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-3">
      <p className="text-sm text-ink/75">
        Transcription never finished. If the audio is still staged, Retry will
        send it to Whisper again.
      </p>
      {canEdit ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
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
          }}
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
