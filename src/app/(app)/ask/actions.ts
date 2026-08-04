"use server";

import OpenAI from "openai";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { searchCommons } from "@/lib/embeddings/search-commons";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";

export type AskSource = {
  documentId: string;
  title: string;
  type: string | null;
  sessionName: string | null;
};

export type AskResult =
  | { ok: true; answer: string; sources: AskSource[] }
  | { ok: false; error: string };

const NOTHING_FOUND_ANSWER =
  "I couldn't find anything in the Camp CLAI Commons about that yet. Try a different question, or check back once more has been added.";

export async function askClara(question: string): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, error: "Ask something first." };
  }

  const { stream, error: streamError } = await getActiveStream();
  if (!stream) {
    return { ok: false, error: streamError ?? "Sign in to ask CLara." };
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Ask CLara isn't configured yet (missing OPENAI_API_KEY).",
    };
  }

  const { matches, error: searchError } = await searchCommons(
    stream.id,
    trimmed,
  );
  if (searchError) {
    return { ok: false, error: searchError };
  }

  if (matches.length === 0) {
    return { ok: true, answer: NOTHING_FOUND_ANSWER, sources: [] };
  }

  const context = matches
    .map((match, index) => {
      const label = [match.documentTitle ?? "Untitled", match.sessionName]
        .filter(Boolean)
        .join(" · ");
      return `[${index + 1}] (${label})\n${match.content}`;
    })
    .join("\n\n");

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content:
          "You are Ask CLara, for the CLara platform (Camp CLAI stream). " +
          "Answer the user's question using ONLY the numbered Camp CLAI " +
          "Commons excerpts provided below — never your own outside " +
          "knowledge. Cite the excerpts you rely on inline using their " +
          "[n] number. If the excerpts don't actually contain enough " +
          "information to answer, say so plainly instead of guessing.",
      },
      {
        role: "user",
        content: `Commons excerpts:\n\n${context}\n\nQuestion: ${trimmed}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    return { ok: false, error: "CLara didn't return an answer — try again." };
  }

  const seenDocumentIds = new Set<string>();
  const sources: AskSource[] = [];
  for (const match of matches) {
    if (seenDocumentIds.has(match.documentId)) continue;
    seenDocumentIds.add(match.documentId);
    sources.push({
      documentId: match.documentId,
      title: match.documentTitle ?? "Untitled",
      type: match.documentType,
      sessionName: match.sessionName,
    });
  }

  return { ok: true, answer, sources };
}
