import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiTranscriptionModel } from "@/lib/openai/env";

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
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Transcribe one audio clip via OpenAI Whisper. Never throws. */
export async function transcribeAudio(file: File): Promise<TranscribeResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not configured." };
  }

  try {
    const client = new OpenAI({ apiKey });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: getOpenAiTranscriptionModel(),
    });

    const text = transcription.text?.trim() ?? "";
    if (!text) {
      return { ok: false, error: "No speech detected in the recording." };
    }

    return { ok: true, text };
  } catch (err) {
    console.error("transcribeAudio failed:", err);
    return { ok: false, error: "Transcription failed. Please try again." };
  }
}
