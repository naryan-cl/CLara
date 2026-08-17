import { toFile } from "openai";
import {
  inngest,
  CLARA_RECORDING_RECEIVED,
  CLARA_DOCUMENT_CREATED,
  type ClaraRecordingReceivedEvent,
} from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  shiftTranscriptClocks,
  transcribeAudio,
} from "@/lib/openai/transcribe";
import { listensStagingExtension } from "@/lib/listens/audio-format";
import {
  isListensFailureBody,
  isListensPendingBody,
  LISTENS_FAILURE_PLACEHOLDER,
} from "@/lib/listens/placeholders";
import {
  parseListensJobMeta,
  stripListensJobMeta,
  withListensJobMeta,
  type ListensJobMeta,
} from "@/lib/listens/job-meta";
import { mapTranscriptSpeakersToNames } from "@/lib/listens/map-speakers";
import {
  asParticipantNames,
  resolveSessionParticipantNames,
} from "@/lib/listens/participant-names";

/** Fallback when the API omits duration (keeps multi-chunk clocks roughly aligned). */
const FALLBACK_SEGMENT_SECONDS = 12 * 60;

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
    fileExtension: listensStagingExtension({
      fileExtension: data.fileExtension,
      mimeType: data.mimeType,
    }),
  };
}

/**
 * Listens v2 Module B: diarize/Whisper each staged segment in order, shift
 * clocks so the full take is continuous, map Speaker A/B → session names,
 * write Transcript (keeping the staging pointer), fan out clara/document.created.
 * Staging audio is kept until the Commons document is deleted so a later
 * Whisper failure still has something to Retry.
 */
async function markTranscriptionFailed(
  documentId: string,
  meta: ListensJobMeta | null,
): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("documents")
    .select("content")
    .eq("id", documentId)
    .maybeSingle();

  const existingContent = existing?.content
    ? String(existing.content)
    : "";
  const body = stripListensJobMeta(existingContent);
  // Don't clobber a real transcript if this failure handler races a later success.
  if (
    existingContent &&
    !isListensPendingBody(body) &&
    !isListensFailureBody(body)
  ) {
    return;
  }

  const fromRow = existingContent ? parseListensJobMeta(existingContent) : null;
  const job = meta ?? fromRow;
  const content = job
    ? withListensJobMeta(LISTENS_FAILURE_PLACEHOLDER, job)
    : LISTENS_FAILURE_PLACEHOLDER;

  const { error } = await admin
    .from("documents")
    .update({
      content,
      needs_review: true,
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(`mark-transcription-failed: ${error.message}`);
  }
}

function jobMetaFromPayload(payload: RecordingPayload): ListensJobMeta {
  return {
    recordingId: payload.recordingId,
    segmentCount: payload.segmentCount,
    mimeType: payload.mimeType,
    fileExtension: listensStagingExtension({
      fileExtension: payload.fileExtension,
      mimeType: payload.mimeType,
    }),
  };
}

export const transcribeRecordingFn = inngest.createFunction(
  {
    id: "clara-transcribe-recording",
    retries: 2,
    triggers: [{ event: CLARA_RECORDING_RECEIVED }],
    onFailure: async ({ event, error }) => {
      try {
        const original = (event as { data?: { event?: unknown } }).data
          ?.event;
        const payload = readRecordingPayload(original);
        await markTranscriptionFailed(
          payload.documentId,
          jobMetaFromPayload(payload),
        );
      } catch (err) {
        console.error(
          "transcribe-recording onFailure could not mark document failed:",
          err,
          error,
        );
      }
    },
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
    const ext = listensStagingExtension({
      fileExtension,
      mimeType,
    });

    const parts: string[] = [];
    let timeOffsetSeconds = 0;

    for (let i = 0; i < segmentCount; i++) {
      const storagePath = `${streamId}/${recordingId}/${i}.${ext}`;
      const chunk = await step.run(`transcribe-segment-${i}`, async () => {
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

        // Strip codecs= from MediaRecorder MIME; Whisper keys off the filename.
        const simpleMime = (mimeType || "audio/webm").split(";")[0]?.trim();
        const file = await toFile(buffer, `recording-${i}.${ext}`, {
          type: simpleMime || "audio/webm",
        });

        const result = await transcribeAudio(file);
        if (!result.ok) {
          // Fail the step so Inngest shows the Whisper error (not a silent empty doc).
          throw new Error(
            `Whisper segment ${i} (${buffer.byteLength} bytes, ${simpleMime}, ${storagePath}): ${result.error}`,
          );
        }
        return {
          text: result.text,
          durationSeconds: result.durationSeconds,
          hasSpeakers: result.hasSpeakers,
        };
      });

      if (chunk?.text?.trim()) {
        parts.push(shiftTranscriptClocks(chunk.text.trim(), timeOffsetSeconds));
        timeOffsetSeconds +=
          chunk.durationSeconds > 0
            ? chunk.durationSeconds
            : FALLBACK_SEGMENT_SECONDS;
      }
    }

    let transcript = parts.join("\n\n");

    const participantNames = await step.run(
      "resolve-participant-names",
      async () => {
        const admin = createAdminClient();
        const { data: doc, error } = await admin
          .from("documents")
          .select("participants, session_id")
          .eq("id", documentId)
          .maybeSingle();
        if (error) {
          throw new Error(`resolve-participant-names: ${error.message}`);
        }

        const seeded = asParticipantNames(doc?.participants);
        if (seeded.length > 0) return seeded;

        const sessionIds: string[] = [];
        if (doc?.session_id) sessionIds.push(doc.session_id as string);

        const { data: links } = await admin
          .from("document_sessions")
          .select("session_id")
          .eq("document_id", documentId);
        for (const row of links ?? []) {
          if (row.session_id) sessionIds.push(row.session_id as string);
        }

        return resolveSessionParticipantNames(sessionIds, admin);
      },
    );

    if (transcript.trim() && participantNames.length > 0) {
      transcript = await step.run("map-speaker-names", async () => {
        return mapTranscriptSpeakersToNames(transcript, participantNames);
      });
    }

    await step.run("apply-transcript", async () => {
      const admin = createAdminClient();
      const success = Boolean(transcript.trim());

      // Keep needs_review true on success until OKF enrich settles metadata.
      // Why: the dashboard can show “Summarizing…” between Whisper and OKF
      // without a separate job-status column.
      const job = {
        recordingId,
        segmentCount,
        mimeType,
        fileExtension: ext,
      } as const;
      const patch: Record<string, unknown> = {
        content: success
          ? withListensJobMeta(transcript, job)
          : withListensJobMeta(LISTENS_FAILURE_PLACEHOLDER, job),
        needs_review: true,
      };
      if (participantNames.length > 0) {
        patch.participants = participantNames;
      }

      const { error } = await admin
        .from("documents")
        .update(patch)
        .eq("id", documentId);

      if (error) throw new Error(`apply-transcript: ${error.message}`);
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
      participantCount: participantNames.length,
    };
  },
);
