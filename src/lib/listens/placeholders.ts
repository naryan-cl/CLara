/** Shown on the Commons Transcript until Whisper finishes (Listens v2). */
export const LISTENS_PENDING_PLACEHOLDER =
  "_Transcription in progress. This updates automatically when ready…_";

export const LISTENS_FAILURE_PLACEHOLDER =
  "_Automatic transcription failed for this recording. Use Retry if the audio " +
  "is still available, or Edit to paste a transcript._";

/** Older failure copy (before Retry existed). */
const LISTENS_FAILURE_PLACEHOLDER_LEGACY =
  "_Automatic transcription failed for this recording. Edit this document to " +
  "paste a transcript manually, or try recording again._";

export function isListensPendingBody(body: string): boolean {
  return body.trim() === LISTENS_PENDING_PLACEHOLDER;
}

export function isListensFailureBody(body: string): boolean {
  const trimmed = body.trim();
  return (
    trimmed === LISTENS_FAILURE_PLACEHOLDER ||
    trimmed === LISTENS_FAILURE_PLACEHOLDER_LEGACY ||
    trimmed.startsWith("_Automatic transcription failed")
  );
}
