import { inngest, CLARA_RECORDING_RECEIVED } from "@/lib/inngest/client";
import { listensStagingExtension } from "@/lib/listens/audio-format";

const DEFAULT_SEND_TIMEOUT_MS = 5_000;

/**
 * Ask Inngest to Whisper a staged recording.
 * Why: awaiting the HTTP send can hang after the event is accepted, which
 * used to freeze Record on “Finalizing…”. We cap the wait; a late delivery
 * can still run because Storage + the placeholder document stay.
 */
export async function enqueueRecordingTranscription(
  data: {
    documentId: string;
    streamId: string;
    recordingId: string;
    segmentCount: number;
    mimeType: string;
    fileExtension: string;
  },
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const payload = {
    ...data,
    fileExtension: listensStagingExtension({
      fileExtension: data.fileExtension,
      mimeType: data.mimeType,
    }),
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      inngest.send({
        name: CLARA_RECORDING_RECEIVED,
        data: payload,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Inngest send timed out"));
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    console.error("Listens transcription enqueue issue (document kept):", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
