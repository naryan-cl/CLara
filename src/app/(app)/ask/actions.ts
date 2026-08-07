"use server";

import OpenAI from "openai";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { searchCommons } from "@/lib/embeddings/search-commons";
import { getAskScopeEmbeddingStatus } from "@/lib/embeddings/get-document-embedding-status";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import { getEffectiveSystemPrompt } from "@/lib/prompts/get-stream-prompts";
import type { AskScope } from "@/lib/ask/scope";
import { askScopeIsActive } from "@/lib/ask/scope";

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
  | {
      ok: true;
      answer: string;
      sources: AskSource[];
      /** False when scoped Ask found no embedding chunks for that element. */
      indexed?: boolean;
    }
  | { ok: false; error: string };

const NOTHING_FOUND_ANSWER =
  "I couldn't find anything in the Camp CLAI Commons about that yet. Try a different question, or check back once more has been added.";

const NOTHING_FOUND_SCOPED =
  "I couldn't find anything grounded in that Commons element yet. Try a different question about it.";

const NOT_INDEXED_SCOPED =
  "This Commons element isn't in Ask CLara's search index yet. Background indexing may still be running — wait a moment and try again, or ask a stream admin to re-index from Admin → Ask index.";

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
 * Optional `history` enables follow-ups; optional `scope` limits retrieval
 * to one document or session (dashboard map "Ask about this").
 * Separate from the CLara Chatbot (Add → Reflect).
 */
export async function askClara(
  question: string,
  history: AskHistoryMessage[] = [],
  scope: AskScope | null = null,
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
  const scoped = askScopeIsActive(scope);

  // When scoped, check the Ask index before retrieval so we can tell
  // "not embedded yet" apart from "nothing relevant in this element".
  if (scoped) {
    const indexStatus = await getAskScopeEmbeddingStatus(stream.id, scope);
    if (!indexStatus.unknown && !indexStatus.indexed && prior.length === 0) {
      return {
        ok: true,
        answer: NOT_INDEXED_SCOPED,
        sources: [],
        indexed: false,
      };
    }
  }

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
    undefined,
    undefined,
    scope,
  );
  if (searchError) {
    return { ok: false, error: searchError };
  }

  if (matches.length === 0 && prior.length === 0) {
    return {
      ok: true,
      answer: scoped ? NOTHING_FOUND_SCOPED : NOTHING_FOUND_ANSWER,
      sources: [],
      indexed: true,
    };
  }

  const scopeHint = scoped
    ? `\n\n(Ground answers only in excerpts from: ${scope!.label}. If the excerpts aren't enough, say so clearly.)`
    : "";

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

  const { prompt: systemPrompt } = await getEffectiveSystemPrompt(
    stream.id,
    "ask",
  );

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getOpenAiChatModel(),
    messages: [
      {
        role: "system",
        content: systemPrompt + scopeHint,
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

  return { ok: true, answer, sources, indexed: true };
}

/**
 * Pre-ask check for scoped UI banners ("Indexing… / not indexed yet").
 */
export async function getScopedAskIndexStatus(
  scope: AskScope | null,
): Promise<{
  indexed: boolean;
  unknown: boolean;
  chunkCount: number;
  error: string | null;
}> {
  if (!askScopeIsActive(scope)) {
    return { indexed: true, unknown: false, chunkCount: 0, error: null };
  }

  const { stream, error: streamError } = await getActiveStream();
  if (!stream) {
    return {
      indexed: false,
      unknown: false,
      chunkCount: 0,
      error: streamError ?? "No active stream.",
    };
  }

  const status = await getAskScopeEmbeddingStatus(stream.id, scope);
  return {
    indexed: status.indexed,
    unknown: status.unknown,
    chunkCount: status.chunkCount,
    error: status.error,
  };
}
