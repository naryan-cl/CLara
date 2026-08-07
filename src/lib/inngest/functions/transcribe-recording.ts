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

type RecordingPayload = ClaraRecordingReceivedEvent["data"];

function readRecordingPayload(event: unknown): RecordingPayload {
  const data = (event as { data?: Partial<RecordingPayload> } | null)?.data;
  if (!data?.documentId || !data?.streamId || !data?.recordingId) {
    throw new Error(
      `clara/recording.received missing fields: documentId=${data?.documentId ?? "?"}, streamId=${data?.streamId ?? "?"}, recordingId=${data?.recordingId ?? "?"}. Redeploy so client and Inngest function both use Module B payload.`,
    );
  }
  const segmentCount = Number(data.segmentCount);
  if (!Number.isInteger(segmentCount) || segmentCount < 1) {
    throw new Error(
      `clara/recording.received invalid segmentCount=${String(data.segmentCount)}`,
    );
  }
  return {
    documentId: data.documentId,
    streamId: data.streamId,
    recordingId: data.recordingId,
    segmentCount,
    mimeType: data.mimeType || "audio/webm",
    fileExtension: data.fileExtension === "m4a" ? "m4a" : "webm",
  };
}

/**
 * Listens v2 Module B: Whisper each staged segment in order, join text,
 * write Transcript, delete staging objects, fan out clara/document.created.
 */
export const transcribeRecordingFn = inngest.createFunction(
  {
    id: "clara-transcribe-recording",
    retries: 2,
    triggers: [{ event: CLARA_RECORDING_RECEIVED }],
  },
  async ({ event, step }) => {
    const {
      documentId,
      streamId,
      recordingId,
      segmentCount,
      mimeType,
      fileExtension,
    } = readRecordingPayload(event);
    const ext = fileExtension === "m4a" ? "m4a" : "webm";

    const parts: string[] = [];

    for (let i = 0; i < segmentCount; i++) {
      const storagePath = `${streamId}/${recordingId}/${i}.${ext}`;
      const text = await step.run(`transcribe-segment-${i}`, async () => {
        // Surface env gaps clearly in the Inngest run UI.
        if (!process.env.SUPABASE_SECRET_KEY?.trim()) {
          throw new Error(
            "SUPABASE_SECRET_KEY missing in Vercel runtime (needed to download listens-staging).",
          );
        }
        if (!process.env.OPENAI_API_KEY?.trim()) {
          throw new Error(
            "OPENAI_API_KEY missing in Vercel runtime (needed for Whisper).",
          );
        }

        const admin = createAdminClient();
        const { data, error } = await admin.storage
          .from("listens-staging")
          .download(storagePath);

        if (error) {
          throw new Error(
            `download ${storagePath}: ${error.message} (confirm the browser uploaded this object and migration 0014 created bucket listens-staging)`,
          );
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        if (buffer.byteLength === 0) {
          throw new Error(`download ${storagePath}: empty object`);
        }

        const file = await toFile(buffer, `recording-${i}.${ext}`, {
          type: mimeType || "audio/webm",
        });

        const result = await transcribeAudio(file);
        if (!result.ok) {
          // Fail the step so Inngest shows the Whisper error (not a silent empty doc).
          throw new Error(`Whisper segment ${i}: ${result.error}`);
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
