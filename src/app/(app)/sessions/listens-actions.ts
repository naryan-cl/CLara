"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { createDocument } from "@/lib/documents/create-document";
import { linkDocumentSessions } from "@/lib/documents/link-document-sessions";
import { parseSessionIdsFromFormData } from "@/lib/documents/parse-session-ids";
import { inngest, CLARA_DOCUMENT_CREATED } from "@/lib/inngest/client";
import { transcribeAudio, MAX_AUDIO_BYTES } from "@/lib/openai/transcribe";

export type ListensResult =
  | { ok: true; documentId: string; needsReview: boolean }
  | { ok: false; error: string };

/**
 * CLara Listens (v1): a short mic recording → Whisper transcript → Commons
 * document for the active stream. Kept separate from Receives per the
 * dev-plan's "one module per surface" split, even though both end at
 * createDocument().
 */
export async function receiveListensRecording(
  formData: FormData,
): Promise<ListensResult> {
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

    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return { ok: false, error: "No recording received. Try again." };
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return {
        ok: false,
        error:
          "Recording is too long for this first Listens path (max ~4MB, roughly 15 minutes). Try a shorter clip.",
      };
    }

    const transcribed = await transcribeAudio(audio);
    if (!transcribed.ok) {
      return { ok: false, error: transcribed.error };
    }

    const titleFromForm = String(formData.get("title") ?? "").trim();
    const title = titleFromForm || `Recording — ${new Date().toLocaleString()}`;
    const sessionIds = parseSessionIdsFromFormData(formData);
    const primarySessionId = sessionIds[0] ?? null;

    const { document, error } = await createDocument({
      streamId: stream.id,
      createdBy: user.id,
      content: transcribed.text,
      title,
      type: "Transcript",
      privacyStatus: "public",
      sessionId: primarySessionId,
    });

    if (error || !document) {
      return { ok: false, error: error ?? "Saving the transcript failed." };
    }

    const linkError = await linkDocumentSessions(document.id, sessionIds);
    if (linkError.error) {
      return { ok: false, error: linkError.error };
    }

    try {
      await inngest.send({
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId: document.id, streamId: stream.id },
      });
    } catch (err) {
      // OKF enrichment is best-effort — never fail the recording over it.
      console.error("Failed to enqueue OKF enrichment:", err);
    }

    return {
      ok: true,
      documentId: document.id,
      needsReview: document.needs_review,
    };
  } catch (err) {
    console.error("receiveListensRecording failed:", err);
    return {
      ok: false,
      error: "Something went wrong while transcribing. Try again.",
    };
  }
}
