import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiTranscriptionModel } from "@/lib/openai/env";

/**
 * Keeps a recorded clip under Vercel's ~4.5MB serverless request body cap.
 * At the 32kbps mono bitrate CLara Listens records at, this is roughly
 * 15-17 minutes of speech.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

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
