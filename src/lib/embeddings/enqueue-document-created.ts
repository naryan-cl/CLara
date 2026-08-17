import {
  inngest,
  CLARA_DOCUMENT_CREATED,
  CLARA_DOCUMENT_SUMMARIZE,
} from "@/lib/inngest/client";

/**
 * Best-effort fan-out onto `clara/document.created` (OKF enrich + embed +
 * graph extract + per-element summary). Never throws — callers must not fail
 * a user save over this.
 */
export async function enqueueDocumentCreated(
  documentId: string,
  streamId: string,
): Promise<void> {
  try {
    await inngest.send({
      name: CLARA_DOCUMENT_CREATED,
      data: { documentId, streamId },
    });
  } catch (err) {
    console.error("Failed to enqueue clara/document.created:", err);
  }
}

/**
 * Summary-only job (private Reflect, or backfill when an older row has no
 * summary yet). Does not re-embed or extract map nodes.
 */
export async function enqueueDocumentSummarize(
  documentId: string,
  streamId: string,
): Promise<void> {
  try {
    await inngest.send({
      name: CLARA_DOCUMENT_SUMMARIZE,
      data: { documentId, streamId },
    });
  } catch (err) {
    console.error("Failed to enqueue clara/document.summarize:", err);
  }
}
