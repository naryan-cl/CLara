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

/** Prior turns for follow-up questions (client-held; not the Chatbot). */
export type AskHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AskResult =
  | { ok: true; answer: string; sources: AskSource[] }
  | { ok: false; error: string };

const NOTHING_FOUND_ANSWER =
  "I couldn't find anything in the Camp CLAI Commons about that yet. Try a different question, or check back once more has been added.";

/** Cap history so prompts stay bounded (same spirit as Chatbot's cap). */
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 3000;

function sanitizeHistory(
  history: AskHistoryMessage[] | undefined,
): AskHistoryMessage[] {
  if (!history || history.length === 0) return [];
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, MAX_HISTORY_CHARS),
    }));
}

/**
 * Ask CLara — grounded RAG over the Commons.
 * Optional `history` enables follow-ups in the same UI session without
 * mixing prompts/state with the CLara Chatbot (Add → Reflect).
 */
export async function askClara(
  question: string,
  history: AskHistoryMessage[] = [],
): Promise<AskResult> {
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

  const prior = sanitizeHistory(history);

  // Retrieval uses the latest question. For short follow-ups ("what else?"),
  // blend the previous user question so embeddings stay on-topic.
  const lastUser = [...prior].reverse().find((m) => m.role === "user");
  const retrievalQuery =
    trimmed.length < 40 && lastUser
      ? `${lastUser.content}\n${trimmed}`
      : trimmed;

  const { matches, error: searchError } = await searchCommons(
    stream.id,
    retrievalQuery,
  );
  if (searchError) {
    return { ok: false, error: searchError };
  }

  if (matches.length === 0 && prior.length === 0) {
    return { ok: true, answer: NOTHING_FOUND_ANSWER, sources: [] };
  }

  const context =
    matches.length === 0
      ? "(No new Commons excerpts matched this follow-up. Answer from prior turns if you can, or say you need a clearer question.)"
      : matches
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
          "information to answer, say so plainly instead of guessing. " +
          "You may use earlier turns in this Ask thread only to understand " +
          "follow-up questions — still ground factual claims in the excerpts.",
      },
      ...prior.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        role: "user" as const,
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
