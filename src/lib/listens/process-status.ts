import {
  isListensFailureBody,
  isListensPendingBody,
} from "@/lib/listens/placeholders";
import { stripListensJobMeta } from "@/lib/listens/job-meta";
import {
  needsElementSummary,
  SUMMARIZING_WINDOW_MS,
} from "@/lib/documents/summary";

/** User-facing pipeline state for a Commons document in Dashboard/Commons. */
export type RecordingProcessStatus =
  | "transcribing"
  | "summarizing"
  | "failed"
  | "needs_review"
  | "ready";

/**
 * If Whisper never writes the placeholder away, stop spinning.
 * Long takes are chunked (~12 min); an hour covers retries without
 * looking "in progress" the next day.
 */
export const TRANSCRIBING_STALE_MS = 60 * 60 * 1000;

/**
 * Derive pipeline status from document fields.
 * Why: Listens is async (Whisper → summary). The UI needs a clear label
 * without a separate job-status column — placeholders + empty `summary`
 * cover the stages. Reflect/Upload also show Summarizing… until their
 * per-element summary lands.
 */
export function recordingProcessStatus(doc: {
  type: string | null;
  content: string;
  summary?: string | null;
  needs_review: boolean;
  is_draft?: boolean | null;
  updated_at: string;
}): RecordingProcessStatus {
  const body = stripListensJobMeta(doc.content);

  if (doc.type === "Transcript") {
    if (isListensFailureBody(body)) {
      return "failed";
    }
    if (isListensPendingBody(body)) {
      const updatedAt = new Date(doc.updated_at).getTime();
      const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
      if (ageMs >= TRANSCRIBING_STALE_MS) {
        return "failed";
      }
      return "transcribing";
    }
  }

  if (
    needsElementSummary(doc) ||
    (doc.type === "Summary" && !doc.summary?.trim() && body)
  ) {
    const updatedAt = new Date(doc.updated_at).getTime();
    const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
    if (ageMs >= 0 && ageMs < SUMMARIZING_WINDOW_MS) {
      return "summarizing";
    }
  }

  if (doc.needs_review) {
    return "needs_review";
  }

  return "ready";
}

export function recordingProcessLabel(
  status: RecordingProcessStatus,
): string | null {
  switch (status) {
    case "transcribing":
      return "Transcribing…";
    case "summarizing":
      return "Summarizing…";
    case "failed":
      return "Transcription failed";
    case "needs_review":
      return "Needs review";
    case "ready":
      return null;
  }
}

export function isRecordingProcessing(status: RecordingProcessStatus): boolean {
  return status === "transcribing" || status === "summarizing";
}
