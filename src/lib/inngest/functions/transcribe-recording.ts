import { toFile } from "openai";
import {
  inngest,
  CLARA_RECORDING_RECEIVED,
  CLARA_DOCUMENT_CREATED,
  type ClaraRecordingReceivedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeAudio } from "@/lib/openai/transcribe";
import { LISTENS_FAILURE_PLACEHOLDER } from "@/lib/listens/placeholders";

/**
 * Listens v2 Module B: Whisper each staged segment in order, join text,
 * write Transcript, delete staging objects, fan out clara/document.created.
 * No audio stitch — same text-join model as Old Clara, async via Inngest.
 */
export const transcribeRecordingFn = inngest.createFunction(
  {
    id: "clara-transcribe-recording",
    retries: 2,
    triggers: [{ event: CLARA_RECORDING_RECEIVED }],
  },
  async ({ event, step }) => {
    const { documentId, streamId, recordingId, segmentCount, mimeType, fileExtension } =
      (event as unknown as ClaraRecordingReceivedEvent).data;
    const ext = fileExtension === "m4a" ? "m4a" : "webm";

    const parts: string[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const storagePath = `${streamId}/${recordingId}/${i}.${ext}`;
      const text = await step.run(`transcribe-segment-${i}`, async () => {
        const admin = createAdminClient();
        const { data, error } = await admin.storage
          .from("listens-staging")
          .download(storagePath);

        if (error) throw new Error(`download ${storagePath}: ${error.message}`);

        const buffer = Buffer.from(await data.arrayBuffer());
        const file = await toFile(buffer, `recording-${i}.${ext}`, {
          type: mimeType || "audio/webm",
        });

        const result = await transcribeAudio(file);
        if (!result.ok) {
          console.error(
            `transcribe-recording: segment ${i} failed`,
            result.error,
          );
          return null;
        }
        return result.text;
      });

      if (text?.trim()) {
        parts.push(text.trim());
      }
    }

    const transcript = parts.join("\n\n");

    await step.run("apply-transcript", async () => {
      const admin = createAdminClient();
      const success = Boolean(transcript.trim());

      const { error } = await admin
        .from("documents")
        .update({
          content: success ? transcript : LISTENS_FAILURE_PLACEHOLDER,
          needs_review: !success,
        })
        .eq("id", documentId);

      if (error) throw new Error(`apply-transcript: ${error.message}`);
    });

    await step.run("cleanup-storage", async () => {
      const admin = createAdminClient();
      const paths = Array.from(
        { length: segmentCount },
        (_, i) => `${streamId}/${recordingId}/${i}.${ext}`,
      );
      const { error } = await admin.storage
        .from("listens-staging")
        .remove(paths);
      if (error) {
        console.error("transcribe-recording: storage cleanup failed", error);
      }
    });

    if (transcript.trim()) {
      await step.sendEvent("trigger-okf-enrich", {
        name: CLARA_DOCUMENT_CREATED,
        data: { documentId, streamId },
      });
    }

    return {
      ok: true,
      documentId,
      transcribed: Boolean(transcript.trim()),
      segmentCount,
      partsWithSpeech: parts.length,
    };
  },
);
