import OpenAI, { toFile } from "openai";
import type { TranscriptionDiarized } from "openai/resources/audio/transcriptions";
import {
  getOpenAiApiKey,
  getOpenAiTranscriptionModel,
} from "@/lib/openai/env";
import {
  formatTranscriptMarkdown,
  type TranscriptSegment,
} from "@/lib/listens/format-transcript";

/**
 * Sync Receives / legacy Listens body-size cap (Vercel ~4.5MB request limit).
 * Listens v2 uploads via Storage and uses MAX_LISTENS_STAGING_BYTES instead.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * OpenAI Whisper file upload limit. Listens v2 stages audio in Storage, so
 * this — not Vercel's request body — is the hard size ceiling for one take.
 * At 32kbps mono that is roughly 90–100 minutes.
 */
export const MAX_LISTENS_STAGING_BYTES = 25 * 1024 * 1024;

export type TranscribeResult =
  | {
      ok: true;
      /** Markdown body ready for Commons (speakers + timestamps when available). */
      text: string;
      /** Audio duration in seconds (from the API when provided). */
      durationSeconds: number;
      /** True when diarized speaker labels were present. */
      hasSpeakers: boolean;
    }
  | { ok: false; error: string };

function isDiarizeModel(model: string): boolean {
  return model.toLowerCase().includes("diarize");
}

function isWhisperModel(model: string): boolean {
  return model.toLowerCase().includes("whisper");
}

function openaiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const body = err as {
      message?: string;
      error?: { message?: string };
    };
    const msg = body.error?.message?.trim() || body.message?.trim();
    if (msg) return msg;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Transcription failed. Please try again.";
}

async function cloneUploadable(file: File, buffer: Buffer) {
  return toFile(Buffer.from(buffer), file.name || "recording.webm", {
    type: file.type || "application/octet-stream",
  });
}

/**
 * Transcribe one audio clip. Prefer gpt-4o-transcribe-diarize (speakers +
 * clocks); fall back to whisper-1 verbose segments (clocks only) when the
 * env model is Whisper. Phone AAC/mp4 sometimes fails diarize — retry Whisper
 * on API/format errors. Never throws.
 */
export async function transcribeAudio(file: File): Promise<TranscribeResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not configured." };
  }

  const model = getOpenAiTranscriptionModel();
  const client = new OpenAI({ apiKey });
  const buffer = Buffer.from(await file.arrayBuffer());
  const makeFile = () => cloneUploadable(file, buffer);

  try {
    if (isDiarizeModel(model)) {
      try {
        const diarized = await transcribeDiarized(client, await makeFile(), model);
        if (diarized.ok) return diarized;
        console.error(
          "transcribeAudio diarize empty, trying whisper-1:",
          diarized.error,
        );
      } catch (err) {
        console.error("transcribeAudio diarize failed, trying whisper-1:", err);
      }
      return await transcribeWhisperVerbose(
        client,
        await makeFile(),
        "whisper-1",
      );
    }

    if (isWhisperModel(model)) {
      return await transcribeWhisperVerbose(client, await makeFile(), model);
    }

    // Other models (e.g. gpt-4o-transcribe): plain text only.
    const transcription = await client.audio.transcriptions.create({
      file: await makeFile(),
      model,
    });
    const text = transcription.text?.trim() ?? "";
    if (!text) {
      return { ok: false, error: "No speech detected in the recording." };
    }
    return {
      ok: true,
      text,
      durationSeconds: 0,
      hasSpeakers: false,
    };
  } catch (err) {
    console.error("transcribeAudio failed:", err);
    return { ok: false, error: openaiErrorMessage(err) };
  }
}

async function transcribeDiarized(
  client: OpenAI,
  file: File,
  model: string,
): Promise<TranscribeResult> {
  // SDK overloads don't yet narrow `diarized_json` → TranscriptionDiarized.
  const transcription = (await client.audio.transcriptions.create({
    file,
    model,
    response_format: "diarized_json",
    // Required for diarize when audio is longer than ~30s.
    chunking_strategy: "auto",
  })) as TranscriptionDiarized;

  const durationSeconds =
    typeof transcription.duration === "number" ? transcription.duration : 0;
  const apiSegments = Array.isArray(transcription.segments)
    ? transcription.segments
    : [];

  const segments: TranscriptSegment[] = apiSegments.map((seg) => ({
    speaker: (seg.speaker ?? "").trim() || null,
    start: typeof seg.start === "number" ? seg.start : 0,
    text: (seg.text ?? "").trim(),
  }));

  const formatted = formatTranscriptMarkdown(segments, 0);
  const text = formatted || (transcription.text?.trim() ?? "");
  if (!text) {
    return { ok: false, error: "No speech detected in the recording." };
  }

  return {
    ok: true,
    text,
    durationSeconds,
    hasSpeakers: segments.some((s) => Boolean(s.speaker)),
  };
}

async function transcribeWhisperVerbose(
  client: OpenAI,
  file: File,
  model: string,
): Promise<TranscribeResult> {
  const transcription = await client.audio.transcriptions.create({
    file,
    model,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const durationSeconds =
    typeof transcription.duration === "number" ? transcription.duration : 0;
  const apiSegments = Array.isArray(transcription.segments)
    ? transcription.segments
    : [];

  const segments: TranscriptSegment[] = apiSegments.map((seg) => ({
    speaker: null,
    start: typeof seg.start === "number" ? seg.start : 0,
    text: (seg.text ?? "").trim(),
  }));

  const formatted = formatTranscriptMarkdown(segments, 0);
  const text = formatted || (transcription.text?.trim() ?? "");
  if (!text) {
    return { ok: false, error: "No speech detected in the recording." };
  }

  return {
    ok: true,
    text,
    durationSeconds,
    hasSpeakers: false,
  };
}

/**
 * Re-apply a global time offset to an already-formatted chunk transcript.
 * Used when joining Listens Module B segments so clocks stay continuous.
 *
 * Handles both `**Name** · [M:SS]` and bare `[M:SS]` lines.
 */
export function shiftTranscriptClocks(
  markdown: string,
  offsetSeconds: number,
): string {
  if (!offsetSeconds || !markdown.trim()) return markdown;

  return markdown.replace(
    /^(\*\*[^*]+\*\* · )?\[(\d+:[\d:]+)\]/gm,
    (_full, speakerPrefix: string | undefined, clock: string) => {
      const absolute = parseClock(clock) + offsetSeconds;
      const next = formatClockLocal(absolute);
      return `${speakerPrefix ?? ""}[${next}]`;
    },
  );
}

function parseClock(clock: string): number {
  const parts = clock.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

function formatClockLocal(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}
