import {
  inngest,
  CLARA_DOCUMENT_CREATED,
} from "@/lib/inngest/client";

/**
 * Best-effort fan-out onto `clara/document.created` (OKF enrich + embed +
 * graph extract). Never throws — callers must not fail a user save over this.
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
