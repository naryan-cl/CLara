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
import {
  alternateAudioUploadMeta,
  isLikelyAudioFormatError,
  openaiAudioUploadMeta,
  type OpenAiAudioUploadMeta,
} from "@/lib/listens/audio-format";
import { stripWhisperArtifacts } from "@/lib/listens/strip-whisper-artifacts";

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

function toTranscriptSegment(seg: {
  speaker?: string | null;
  start?: number;
  end?: number;
  text?: string;
}): TranscriptSegment {
  const start = typeof seg.start === "number" ? seg.start : 0;
  const end = typeof seg.end === "number" ? seg.end : undefined;
  return {
    speaker: (seg.speaker ?? "").trim() || null,
    start,
    end,
    text: (seg.text ?? "").trim(),
  };
}

function isWhisperModel(model: string): boolean {
  return model.toLowerCase().includes("whisper");
}

function openaiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const body = err as {
      status?: number;
      message?: string;
      code?: string | null;
      error?: { message?: string } | string;
    };
    const nested =
      typeof body.error === "string"
        ? body.error.trim()
        : body.error?.message?.trim();
    const msg = nested || body.message?.trim();
    if (msg) {
      const status =
        typeof body.status === "number" ? `${body.status} ` : "";
      return `${status}${msg}`.trim();
    }
    if (typeof body.status === "number") {
      return `OpenAI HTTP ${body.status}`;
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") return json;
  } catch {
    // ignore
  }
  return "Transcription failed. Please try again.";
}

async function makeUploadable(buffer: Buffer, meta: OpenAiAudioUploadMeta) {
  return toFile(Buffer.from(buffer), meta.filename, { type: meta.mimeType });
}

/**
 * Transcribe one audio clip. Prefer gpt-4o-transcribe-diarize (speakers +
 * clocks); fall back to whisper-1 verbose segments (clocks only), then plain
 * Whisper JSON. Phone AAC labeled as WebM is sniffed from magic bytes and
 * retried as .m4a when OpenAI rejects the container. Never throws.
 */
export async function transcribeAudio(file: File): Promise<TranscribeResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not configured." };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return {
      ok: false,
      error: `Could not read audio bytes: ${openaiErrorMessage(err)}`,
    };
  }

  if (buffer.byteLength < 256) {
    return {
      ok: false,
      error: `Audio file too small to transcribe (${buffer.byteLength} bytes).`,
    };
  }

  const model = getOpenAiTranscriptionModel();
  const client = new OpenAI({ apiKey });
  const primary = openaiAudioUploadMeta(buffer, {
    filename: file.name,
    mimeType: file.type,
  });
  const alt = alternateAudioUploadMeta(primary);

  console.info("transcribeAudio upload", {
    bytes: buffer.byteLength,
    claimedName: file.name,
    claimedType: file.type,
    using: primary,
  });

  const first = await transcribeWithModels(client, buffer, primary, model);
  if (first.ok) return first;

  if (isLikelyAudioFormatError(first.error)) {
    console.error(
      "transcribeAudio format error, retrying alternate container:",
      primary,
      alt,
      first.error,
    );
    const second = await transcribeWithModels(client, buffer, alt, model);
    if (second.ok) return second;
    return {
      ok: false,
      error: `${first.error} (also tried ${alt.filename}: ${second.error})`,
    };
  }

  return first;
}

async function transcribeWithModels(
  client: OpenAI,
  buffer: Buffer,
  meta: OpenAiAudioUploadMeta,
  model: string,
): Promise<TranscribeResult> {
  const errors: string[] = [];
  const nextFile = () => makeUploadable(buffer, meta);

  if (isDiarizeModel(model)) {
    try {
      const diarized = await transcribeDiarized(
        client,
        await nextFile(),
        model,
      );
      if (diarized.ok) return diarized;
      errors.push(`diarize: ${diarized.error}`);
      console.error(
        "transcribeAudio diarize empty, trying whisper-1:",
        diarized.error,
      );
    } catch (err) {
      errors.push(`diarize: ${openaiErrorMessage(err)}`);
      console.error("transcribeAudio diarize failed, trying whisper-1:", err);
    }
  } else if (!isWhisperModel(model)) {
    try {
      const transcription = await client.audio.transcriptions.create({
        file: await nextFile(),
        model,
      });
      const text = stripWhisperArtifacts(transcription.text?.trim() ?? "");
      if (text) {
        return {
          ok: true,
          text,
          durationSeconds: 0,
          hasSpeakers: false,
        };
      }
      errors.push(`${model}: No speech detected in the recording.`);
    } catch (err) {
      errors.push(`${model}: ${openaiErrorMessage(err)}`);
      console.error("transcribeAudio model failed, trying whisper-1:", err);
    }
  }

  const whisperModel = isWhisperModel(model) ? model : "whisper-1";

  try {
    return await transcribeWhisperVerbose(
      client,
      await nextFile(),
      whisperModel,
    );
  } catch (err) {
    errors.push(`whisper-verbose: ${openaiErrorMessage(err)}`);
    console.error("transcribeAudio whisper verbose failed:", err);
  }

  try {
    return await transcribeWhisperPlain(client, await nextFile(), whisperModel);
  } catch (err) {
    errors.push(`whisper-json: ${openaiErrorMessage(err)}`);
    console.error("transcribeAudio whisper json failed:", err);
  }

  return {
    ok: false,
    error:
      errors.join(" → ") ||
      "Transcription failed. Please try again.",
  };
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

  const segments: TranscriptSegment[] = apiSegments.map((seg) =>
    toTranscriptSegment(seg),
  );

  const formatted = formatTranscriptMarkdown(segments, 0);
  const text = stripWhisperArtifacts(
    formatted || (transcription.text?.trim() ?? ""),
  );
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

  const segments: TranscriptSegment[] = apiSegments.map((seg) =>
    toTranscriptSegment({ ...seg, speaker: null }),
  );

  const formatted = formatTranscriptMarkdown(segments, 0);
  const text = stripWhisperArtifacts(
    formatted || (transcription.text?.trim() ?? ""),
  );
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

async function transcribeWhisperPlain(
  client: OpenAI,
  file: File,
  model: string,
): Promise<TranscribeResult> {
  const transcription = await client.audio.transcriptions.create({
    file,
    model,
  });
  const text = stripWhisperArtifacts(transcription.text?.trim() ?? "");
  if (!text) {
    return { ok: false, error: "No speech detected in the recording." };
  }
  return {
    ok: true,
    text,
    durationSeconds: 0,
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
