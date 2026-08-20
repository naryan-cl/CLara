import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  parseListensJobMeta,
  stripListensJobMeta,
  withListensJobMeta,
} from "@/lib/listens/job-meta";
import { enqueueRecordingTranscription } from "@/lib/listens/enqueue-transcription";
import {
  isListensPendingBody,
  LISTENS_PENDING_PLACEHOLDER,
} from "@/lib/listens/placeholders";
import {
  recordingProcessStatus,
  TRANSCRIBING_STALE_MS,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";

export type StartRetranscribeResult =
  | {
      ok: true;
      document: CommonsDocument;
      processStatus: RecordingProcessStatus;
    }
  | {
      ok: false;
      error: string;
      reason?: "in_progress" | "no_audio" | "no_meta" | "not_found";
    };

function isActivelyTranscribing(doc: {
  content: string;
  updated_at: string;
}): boolean {
  const body = stripListensJobMeta(doc.content);
  if (!isListensPendingBody(body)) return false;
  const updatedAt = new Date(doc.updated_at).getTime();
  const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
  return ageMs < TRANSCRIBING_STALE_MS;
}

/**
 * Reset a Transcript to the pending placeholder and re-enqueue Whisper.
 * Requires original audio still in listens-staging (job meta + object 0).
 * Clears the old summary so the UI does not keep a brief of mashed text.
 * Caller must already have checked edit/admin permission.
 */
export async function startRetranscribe(input: {
  documentId: string;
  streamId: string;
  /** Signed-in client (RLS). Never use the service-role admin client here. */
  client: SupabaseClient;
  /** Bulk admin pass: fail fast on Inngest instead of waiting 5s each. */
  enqueueTimeoutMs?: number;
}): Promise<StartRetranscribeResult> {
  const { client } = input;
  const { data, error } = await client
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("id", input.documentId)
    .eq("stream_id", input.streamId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      reason: "not_found",
      error: error?.message ?? "Document not found.",
    };
  }

  const document = data as CommonsDocument;
  if (document.type !== "Transcript") {
    return { ok: false, error: "Re-transcribe is only for recordings." };
  }

  if (isActivelyTranscribing(document)) {
    return {
      ok: false,
      reason: "in_progress",
      error: "This recording is already transcribing.",
    };
  }

  const meta = parseListensJobMeta(document.content);
  if (!meta) {
    return {
      ok: false,
      reason: "no_meta",
      error:
        "This recording was saved before retry info was stored, so the audio can’t be found. Edit to paste a transcript, or Delete and record again.",
    };
  }

  const prefix = `${input.streamId}/${meta.recordingId}`;
  const { error: probeError } = await client.storage
    .from("listens-staging")
    .createSignedUrl(`${prefix}/0.${meta.fileExtension}`, 60);
  if (probeError) {
    return {
      ok: false,
      reason: "no_audio",
      error:
        "The original audio is no longer in storage, so this transcript can’t be re-run automatically. Edit to paste a transcript, or Delete and upload again.",
    };
  }

  const pendingContent = withListensJobMeta(LISTENS_PENDING_PLACEHOLDER, meta);
  const { data: updated, error: updateError } = await client
    .from("documents")
    .update({
      content: pendingContent,
      summary: null,
      needs_review: true,
    })
    .eq("id", document.id)
    .select(DOCUMENT_SELECT)
    .maybeSingle();

  if (updateError || !updated) {
    return {
      ok: false,
      error:
        updateError?.message ?? "Could not reset this recording for retry.",
    };
  }

  await enqueueRecordingTranscription(
    {
      documentId: document.id,
      streamId: input.streamId,
      recordingId: meta.recordingId,
      segmentCount: meta.segmentCount,
      mimeType: meta.mimeType,
      fileExtension: meta.fileExtension,
    },
    { timeoutMs: input.enqueueTimeoutMs },
  );

  const next = updated as CommonsDocument;
  return {
    ok: true,
    document: next,
    processStatus: recordingProcessStatus(next),
  };
}
