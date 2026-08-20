"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { getDocumentById } from "@/lib/documents/get-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { setDocumentLinks } from "@/lib/documents/set-document-links";
import { isAttending } from "@/lib/sessions/attendance";
import { enqueueRecordingTranscription } from "@/lib/listens/enqueue-transcription";
import { startRetranscribe } from "@/lib/listens/start-retranscribe";
import { LISTENS_PENDING_PLACEHOLDER } from "@/lib/listens/placeholders";
import {
  listensStagingPaths,
  parseListensJobMeta,
  withListensJobMeta,
} from "@/lib/listens/job-meta";
import type { RecordingProcessStatus } from "@/lib/listens/process-status";
import { MAX_LISTENS_SEGMENTS } from "@/lib/listens/constants";
import { listensStagingExtension } from "@/lib/listens/audio-format";
import { resolveSessionParticipantNames } from "@/lib/listens/participant-names";
import type { CommonsDocument } from "@/lib/documents/types";

export type ListensResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

export type PrepareListensRecordingResult =
  | { ok: true; streamId: string; recordingId: string }
  | { ok: false; error: string };

/**
 * Allocate a recording folder under listens-staging:
 * `{streamId}/{recordingId}/{segmentIndex}.webm`
 */
export async function prepareListensRecording(): Promise<PrepareListensRecordingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to record." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return {
      ok: false,
      error: "No active stream. Ask an admin to add you to Camp CLAI.",
    };
  }

  return {
    ok: true,
    streamId: stream.id,
    recordingId: crypto.randomUUID(),
  };
}

/**
 * After the browser has uploaded segment files 0..segmentCount-1, create a
 * placeholder Transcript and enqueue multi-segment Whisper via Inngest.
 */
export async function finalizeListensUpload(input: {
  recordingId: string;
  segmentCount: number;
  mimeType: string;
  /** File extension without dot — webm or m4a. */
  fileExtension?: string;
  title?: string;
  sessionIds?: string[];
  relatedDocumentIds?: string[];
  relatedSessionIds?: string[];
  /** Upload form only — Record leaves this unset (false). */
  isExternal?: boolean;
}): Promise<ListensResult> {
  const uploadedPaths: string[] = [];

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "You must be signed in to record." };
    }

    const { stream } = await getActiveStream();
    if (!stream) {
      return {
        ok: false,
        error: "No active stream. Ask an admin to add you to Camp CLAI.",
      };
    }

    const recordingId = input.recordingId.trim();
    if (!recordingId || recordingId.includes("/")) {
      return { ok: false, error: "Invalid recording id." };
    }

    const segmentCount = input.segmentCount;
    if (
      !Number.isInteger(segmentCount) ||
      segmentCount < 1 ||
      segmentCount > MAX_LISTENS_SEGMENTS
    ) {
      return {
        ok: false,
        error: `Need between 1 and ${MAX_LISTENS_SEGMENTS} audio segments.`,
      };
    }

    const ext = listensStagingExtension({
      fileExtension: input.fileExtension,
      mimeType: input.mimeType,
    });
    const prefix = `${stream.id}/${recordingId}`;
    for (let i = 0; i < segmentCount; i++) {
      uploadedPaths.push(`${prefix}/${i}.${ext}`);
    }

    // Trust client upload; a quick signed-URL check on segment 0 catches
    // obvious missing files without a flaky folder list.
    {
      const { error: probeError } = await supabase.storage
        .from("listens-staging")
        .createSignedUrl(`${prefix}/0.${ext}`, 60);
      if (probeError) {
        return {
          ok: false,
          error:
            probeError.message.includes("not found") ||
            probeError.message.includes("Object") ||
            probeError.message.includes("Bucket")
              ? "Could not find the uploaded recording in Storage. Try recording again (and confirm migration 0014 is applied)."
              : `Could not verify upload: ${probeError.message}`,
        };
      }
    }

    const title =
      (input.title ?? "").trim() ||
      `Recording — ${new Date().toLocaleString()}`;
    const sessionIds = (input.sessionIds ?? []).filter(Boolean);
    const primarySessionId = sessionIds[0] ?? null;
    // Seed OKF participants from session attendees so the dashboard can show
    // names while Whisper runs, and so diarize can map Speaker A/B → people.
    const participants = await resolveSessionParticipantNames(sessionIds);

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content: withListensJobMeta(LISTENS_PENDING_PLACEHOLDER, {
        recordingId,
        segmentCount,
        mimeType: input.mimeType || "audio/webm",
        fileExtension: ext,
      }),
      title,
      type: "Transcript",
      privacyStatus: "public",
      needsReview: true,
      sessionId: primarySessionId,
      participants,
      isExternal: input.isExternal ?? false,
    });

    if (error || !document) {
      await supabase.storage.from("listens-staging").remove(uploadedPaths);
      return { ok: false, error: error ?? "Saving the transcript failed." };
    }

    const linkError = await linkDocumentSessions(document.id, sessionIds);
    if (linkError.error) {
      await supabase.storage.from("listens-staging").remove(uploadedPaths);
      await supabase.from("documents").delete().eq("id", document.id);
      return { ok: false, error: linkError.error };
    }

    await setDocumentLinks({
      streamId: stream.id,
      sourceDocumentId: document.id,
      createdBy: user.id,
      targetDocumentIds: input.relatedDocumentIds,
      targetSessionIds: input.relatedSessionIds,
    });

    await enqueueRecordingTranscription({
      documentId: document.id,
      streamId: stream.id,
      recordingId,
      segmentCount,
      mimeType: input.mimeType || "audio/webm",
      fileExtension: ext,
    });

    return {
      ok: true,
      documentId: document.id,
      needsReview: true,
    };
  } catch (err) {
    console.error("finalizeListensUpload failed:", err);
    return {
      ok: false,
      error: "Something went wrong while saving the recording. Try again.",
    };
  }
}

/**
 * Delete staged segment files after the user confirms Trash (stay on Record).
 */
export async function discardListensStaging(input: {
  recordingId: string;
  segmentCount: number;
  fileExtension?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const { stream } = await getActiveStream();
    if (!stream) {
      return { ok: false, error: "No active stream." };
    }

    const recordingId = input.recordingId.trim();
    if (!recordingId || recordingId.includes("/")) {
      return { ok: false, error: "Invalid recording id." };
    }

    const segmentCount = input.segmentCount;
    if (!Number.isInteger(segmentCount) || segmentCount < 0) {
      return { ok: false, error: "Invalid segment count." };
    }
    if (segmentCount === 0) {
      return { ok: true };
    }

    const ext = listensStagingExtension({
      fileExtension: input.fileExtension,
    });
    const paths = Array.from(
      { length: segmentCount },
      (_, i) => `${stream.id}/${recordingId}/${i}.${ext}`,
    );

    const { error } = await supabase.storage
      .from("listens-staging")
      .remove(paths);
    if (error) {
      return { ok: false, error: `Could not delete recording: ${error.message}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("discardListensStaging failed:", err);
    return { ok: false, error: "Could not delete the recording. Try again." };
  }
}

export type RetryListensResult =
  | {
      ok: true;
      document: CommonsDocument;
      processStatus: RecordingProcessStatus;
    }
  | { ok: false; error: string };

/**
 * Re-enqueue Whisper when staging audio is still in Storage — failed jobs
 * and finished transcripts (so speaker-turn formatting can improve).
 * Older rows with no job meta cannot be retried.
 */
export async function retryListensTranscription(
  documentId: string,
): Promise<RetryListensResult> {
  try {
    const id = documentId.trim();
    if (!id) {
      return { ok: false, error: "Missing document id." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in." };
    }

    const { stream } = await getActiveStream();
    if (!stream) {
      return { ok: false, error: "No active stream." };
    }

    const { document, error } = await getDocumentById(id);
    if (error || !document || document.stream_id !== stream.id) {
      return { ok: false, error: error ?? "Document not found." };
    }
    if (document.type !== "Transcript") {
      return { ok: false, error: "Retry is only for recordings." };
    }

    const attending = document.session_id
      ? (await isAttending(document.session_id, user.id)).attending
      : false;
    const canEdit =
      document.created_by === user.id ||
      stream.role === "admin" ||
      attending === true;
    if (!canEdit) {
      return {
        ok: false,
        error: "You don't have permission to retry this recording.",
      };
    }

    const result = await startRetranscribe({
      documentId: document.id,
      streamId: stream.id,
      client: supabase,
    });
    if (!result.ok) return result;

    revalidatePath("/dashboard");
    revalidatePath("/commons");
    revalidatePath(`/sessions/documents/${document.id}`);

    return result;
  } catch (err) {
    console.error("retryListensTranscription failed:", err);
    return { ok: false, error: "Could not retry transcription. Try again." };
  }
}

export type ListensAudioPlayback =
  | { ok: true; urls: { url: string; label: string }[] }
  | { ok: false; error: string };

/**
 * Signed URLs for the original recording still in listens-staging.
 * Why: if Whisper fails, the contributor can still hear the take.
 */
export async function getListensAudioPlayback(
  documentId: string,
): Promise<ListensAudioPlayback> {
  const { document, error } = await getDocumentById(documentId);
  if (error || !document) {
    return { ok: false, error: error ?? "Document not found." };
  }

  const meta = parseListensJobMeta(document.content);
  if (!meta) {
    return { ok: false, error: "No original audio is linked to this document." };
  }

  const supabase = await createClient();
  const paths = listensStagingPaths(document.stream_id, meta);
  const urls: { url: string; label: string }[] = [];

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const { data, error: signError } = await supabase.storage
      .from("listens-staging")
      .createSignedUrl(path, 60 * 60);
    if (signError || !data?.signedUrl) {
      continue;
    }
    urls.push({
      url: data.signedUrl,
      label: paths.length === 1 ? "Original recording" : `Part ${i + 1}`,
    });
  }

  if (urls.length === 0) {
    return {
      ok: false,
      error: "The original audio is no longer in storage.",
    };
  }

  return { ok: true, urls };
}

/**
 * @deprecated Use prepareListensRecording + finalizeListensUpload (chunked path).
 */
export async function prepareListensUpload(
  extension: string,
): Promise<
  | { ok: true; streamId: string; storagePath: string }
  | { ok: false; error: string }
> {
  const prepared = await prepareListensRecording();
  if (!prepared.ok) return prepared;
  const safeExt = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
  return {
    ok: true,
    streamId: prepared.streamId,
    storagePath: `${prepared.streamId}/${prepared.recordingId}/0${safeExt}`,
  };
}

/**
 * @deprecated Listens v2 uses prepareListensRecording + finalizeListensUpload.
 */
export async function receiveListensRecording(
  _formData: FormData,
): Promise<ListensResult> {
  return {
    ok: false,
    error:
      "This Record path was upgraded. Refresh the page and submit again (Listens v2).",
  };
}
