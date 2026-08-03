import OpenAI from "openai";
import { getOpenAiApiKey, getOpenAiEmbeddingModel } from "@/lib/openai/env";

/** Embed a batch of texts in one OpenAI call. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.embeddings.create({
    model: getOpenAiEmbeddingModel(),
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}
