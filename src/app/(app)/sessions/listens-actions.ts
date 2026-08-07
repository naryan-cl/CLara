"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import {
  inngest,
  CLARA_RECORDING_RECEIVED,
} from "@/lib/inngest/client";
import { MAX_LISTENS_STAGING_BYTES } from "@/lib/openai/transcribe";
import { LISTENS_PENDING_PLACEHOLDER } from "@/lib/listens/placeholders";

export type ListensResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

export type PrepareListensRecordingResult =
  | { ok: true; streamId: string; recordingId: string }
  | { ok: false; error: string };

/** Max segments for a single take (12 min × 20 = 4 hours headroom). */
export const MAX_LISTENS_SEGMENTS = 20;

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

    const ext =
      input.fileExtension === "m4a" || input.fileExtension === "mp4"
        ? "m4a"
        : "webm";
    const prefix = `${stream.id}/${recordingId}`;
    for (let i = 0; i < segmentCount; i++) {
      uploadedPaths.push(`${prefix}/${i}.${ext}`);
    }

    const { data: listed, error: listError } = await supabase.storage
      .from("listens-staging")
      .list(`${stream.id}/${recordingId}`, { limit: MAX_LISTENS_SEGMENTS });

    if (listError) {
      return {
        ok: false,
        error:
          listError.message.includes("not found") ||
          listError.message.includes("Bucket")
            ? "Listens storage isn’t set up yet. Ask an admin to run migration 0014_listens_staging_storage.sql in Supabase."
            : `Could not verify uploads: ${listError.message}`,
      };
    }

    const names = new Set((listed ?? []).map((obj) => obj.name));
    for (let i = 0; i < segmentCount; i++) {
      if (!names.has(`${i}.${ext}`)) {
        return {
          ok: false,
          error: `Missing segment ${i}. Try recording again.`,
        };
      }
    }

    const title =
      (input.title ?? "").trim() ||
      `Recording — ${new Date().toLocaleString()}`;
    const sessionIds = (input.sessionIds ?? []).filter(Boolean);
    const primarySessionId = sessionIds[0] ?? null;

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content: LISTENS_PENDING_PLACEHOLDER,
      title,
      type: "Transcript",
      privacyStatus: "public",
      needsReview: true,
      sessionId: primarySessionId,
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

    try {
      await inngest.send({
        name: CLARA_RECORDING_RECEIVED,
        data: {
          documentId: document.id,
          streamId: stream.id,
          recordingId,
          segmentCount,
          mimeType: input.mimeType || "audio/webm",
          fileExtension: ext,
        },
      });
    } catch (err) {
      console.error("Failed to enqueue Listens transcription:", err);
      await supabase.storage.from("listens-staging").remove(uploadedPaths);
      await supabase.from("documents").delete().eq("id", document.id);
      return {
        ok: false,
        error: "Couldn't start transcription. Try again.",
      };
    }

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

/** Re-export for client size checks on a single segment. */
export { MAX_LISTENS_STAGING_BYTES };
