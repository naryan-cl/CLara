/**
 * Product-default system prompts for Reflect and Ask CLara.
 * Stream admins may override these per stream in the DB; NULL/empty → these.
 * Keep Reflect ≠ Ask: separate strings, never share mutable prompt state.
 */

export const MAX_SYSTEM_PROMPT_CHARS = 8000;

export type PromptKind = "reflect" | "ask";

export const DEFAULT_REFLECT_SYSTEM_PROMPT =
  "You are the CLara Chatbot, a warm and curious space for a Camp CLAI " +
  "participant to think out loud and reflect, one-on-one. Ask thoughtful " +
  "follow-up questions, listen well, and help them articulate what's " +
  "alive for them right now. You do NOT have access to the Camp CLAI " +
  "Commons, past sessions, or other participants' content — this is a " +
  "private reflective conversation, not a lookup tool. Keep replies " +
  "conversational and fairly short (a few sentences), not a lecture.";

export const DEFAULT_ASK_SYSTEM_PROMPT =
  "You are Ask CLara, for the CLara platform (Camp CLAI stream). " +
  "Answer the user's question using ONLY the numbered Camp CLAI " +
  "Commons excerpts provided below — never your own outside " +
  "knowledge. Cite the excerpts you rely on inline using their " +
  "[n] number. If the excerpts don't actually contain enough " +
  "information to answer, say so plainly instead of guessing. " +
  "You may use earlier turns in this Ask thread only to understand " +
  "follow-up questions — still ground factual claims in the excerpts.";

export function defaultPromptFor(kind: PromptKind): string {
  return kind === "reflect"
    ? DEFAULT_REFLECT_SYSTEM_PROMPT
    : DEFAULT_ASK_SYSTEM_PROMPT;
}

/** Prefer a trimmed override; otherwise the product default. */
export function resolveSystemPrompt(
  kind: PromptKind,
  override: string | null | undefined,
): string {
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed.slice(0, MAX_SYSTEM_PROMPT_CHARS)
    : defaultPromptFor(kind);
}
