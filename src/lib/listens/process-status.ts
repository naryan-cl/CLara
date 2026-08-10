import {
  LISTENS_FAILURE_PLACEHOLDER,
  LISTENS_PENDING_PLACEHOLDER,
} from "@/lib/listens/placeholders";

/** User-facing pipeline state for a Listens Transcript in Commons. */
export type RecordingProcessStatus =
  | "transcribing"
  | "summarizing"
  | "failed"
  | "needs_review"
  | "ready";

/** How long a fresh transcript may still be OKF-enriching before we call it review. */
const SUMMARIZING_WINDOW_MS = 120_000;

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Derive recording pipeline status from document fields.
 * Why: Listens is async (Whisper → OKF). The UI needs a clear label without a
 * separate job-status column — placeholders + needs_review cover the stages.
 */
export function recordingProcessStatus(doc: {
  type: string | null;
  content: string;
  needs_review: boolean;
  tags?: unknown;
  updated_at: string;
}): RecordingProcessStatus {
  if (doc.type !== "Transcript") {
    return doc.needs_review ? "needs_review" : "ready";
  }

  if (doc.content === LISTENS_PENDING_PLACEHOLDER) {
    return "transcribing";
  }
  if (doc.content === LISTENS_FAILURE_PLACEHOLDER) {
    return "failed";
  }
  if (!doc.needs_review) {
    return "ready";
  }

  const tags = asStringList(doc.tags);
  const updatedAt = new Date(doc.updated_at).getTime();
  const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
  // Fresh transcript still waiting on OKF (or OKF skipped) — show Summarizing
  // briefly, then fall through to Needs review.
  if (tags.length === 0 && ageMs >= 0 && ageMs < SUMMARIZING_WINDOW_MS) {
    return "summarizing";
  }

  return "needs_review";
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
