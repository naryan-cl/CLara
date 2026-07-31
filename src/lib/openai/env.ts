/** Read OpenAI env at runtime (avoids Next.js baking empty values at build time). */
export function getOpenAiApiKey(): string | undefined {
  const value = process.env.OPENAI_API_KEY?.trim();
  return value || undefined;
}

export function getOpenAiChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";
}

export function getOpenAiTranscriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";
}
