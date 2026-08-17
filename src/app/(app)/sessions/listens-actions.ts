"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { getDocumentById } from "@/lib/documents/get-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { setDocumentLinks } from "@/lib/documents/set-document-links";
import { isAttending } from "@/lib/sessions/attendance";
import {
  inngest,
  CLARA_RECORDING_RECEIVED,
} from "@/lib/inngest/client";
import {
  isListensFailureBody,
  isListensPendingBody,
  LISTENS_PENDING_PLACEHOLDER,
} from "@/lib/listens/placeholders";
import {
  listensStagingPaths,
  parseListensJobMeta,
  stripListensJobMeta,
  withListensJobMeta,
} from "@/lib/listens/job-meta";
import {
  recordingProcessStatus,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";
import { MAX_LISTENS_SEGMENTS } from "@/lib/listens/constants";
import { listensStagingExtension } from "@/lib/listens/audio-format";
import { resolveSessionParticipantNames } from "@/lib/listens/participant-names";
import type { CommonsDocument } from "@/lib/documents/types";

const INNGEST_SEND_TIMEOUT_MS = 5_000;

/**
 * Try to enqueue Whisper, but never block the Record UI for long.
 * Inngest often accepts the event before the HTTP promise settles; awaiting
 * forever left the page stuck on "Finalizing…" while the transcript already
 * finished. On timeout/failure we still return success to the client — the
 * placeholder document + Storage objects remain (do not delete; a late
 * delivery may still run).
 */
async function enqueueRecordingTranscription(data: {
  documentId: string;
  streamId: string;
  recordingId: string;
  segmentCount: number;
  mimeType: string;
  fileExtension: string;
}): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      inngest.send({
        name: CLARA_RECORDING_RECEIVED,
        data,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Inngest send timed out"));
        }, INNGEST_SEND_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.error("Listens transcription enqueue issue (document kept):", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
 * Re-enqueue Whisper for a stuck/failed Transcript when staging audio is
 * still in Storage. Older placeholders (no job meta) cannot be retried.
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

    const body = stripListensJobMeta(document.content);
    if (!isListensPendingBody(body) && !isListensFailureBody(body)) {
      return {
        ok: false,
        error: "This recording already has a transcript.",
      };
    }

    const meta = parseListensJobMeta(document.content);
    if (!meta) {
      return {
        ok: false,
        error:
          "This recording was saved before retry info was stored, so the audio can’t be found. Edit to paste a transcript, or Delete and record again.",
      };
    }

    const prefix = `${stream.id}/${meta.recordingId}`;
    const { error: probeError } = await supabase.storage
      .from("listens-staging")
      .createSignedUrl(`${prefix}/0.${meta.fileExtension}`, 60);
    if (probeError) {
      return {
        ok: false,
        error:
          "The audio is no longer in staging (Whisper may have already cleaned it up). Edit to paste a transcript, or Delete and record again.",
      };
    }

    const pendingContent = withListensJobMeta(LISTENS_PENDING_PLACEHOLDER, meta);
    const { data, error: updateError } = await supabase
      .from("documents")
      .update({
        content: pendingContent,
        needs_review: true,
      })
      .eq("id", document.id)
      .select(
        "id, stream_id, created_by, content, title, session_id, type, participants, tags, privacy_status, needs_review, created_at, updated_at",
      )
      .maybeSingle();

    if (updateError || !data) {
      return {
        ok: false,
        error:
          updateError?.message ??
          "Could not reset this recording for retry.",
      };
    }

    await enqueueRecordingTranscription({
      documentId: document.id,
      streamId: stream.id,
      recordingId: meta.recordingId,
      segmentCount: meta.segmentCount,
      mimeType: meta.mimeType,
      fileExtension: meta.fileExtension,
    });

    revalidatePath("/dashboard");
    revalidatePath("/commons");
    revalidatePath(`/sessions/documents/${document.id}`);

    const next = data as CommonsDocument;
    return {
      ok: true,
      document: next,
      processStatus: recordingProcessStatus(next),
    };
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
