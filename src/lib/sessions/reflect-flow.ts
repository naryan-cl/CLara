/**
 * Guided Reflect helpers: welcome + ordered questions on a session.
 * Simple sessions keep using seed_question only (reflect_questions empty).
 */

export type ReflectFlow = {
  welcome: string | null;
  questions: string[];
};

export const GUIDED_REFLECT_PREAMBLE = "<!-- clara:guided-reflect -->";

/** Parse jsonb / unknown into a clean string array. */
export function parseReflectQuestions(raw: unknown): string[] {
  if (raw == null) return [];
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) list = parsed;
      else return [];
    } catch {
      return [];
    }
  } else {
    return [];
  }
  return list
    .map((q) => (typeof q === "string" ? q.trim() : ""))
    .filter(Boolean);
}

export function isGuidedReflectFlow(flow: ReflectFlow | null | undefined): boolean {
  return Boolean(flow && flow.questions.length > 0);
}

export function buildReflectFlow(input: {
  welcome?: string | null;
  questions?: string[] | null;
}): ReflectFlow {
  return {
    welcome: input.welcome?.trim() || null,
    questions: (input.questions ?? [])
      .map((q) => q.trim())
      .filter(Boolean),
  };
}

/** Marker line when a guided question is introduced in chat / saved content. */
export function questionMarker(index: number, total: number, question: string): string {
  return `### Question ${index + 1} of ${total}: ${question}`;
}

/**
 * Highest 0-based question index referenced by a `Question N of M` marker
 * in assistant text, or null if none.
 */
export function detectQuestionIndexInText(
  content: string,
  totalQuestions: number,
): number | null {
  if (totalQuestions <= 0) return null;
  let highest: number | null = null;
  const re = /(?:^|\n)\s*#{0,3}\s*Question\s+(\d+)\s+of\s+(\d+)\s*:/gi;
  for (const match of content.matchAll(re)) {
    const n = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const idx = Math.min(n - 1, totalQuestions - 1);
    if (highest === null || idx > highest) highest = idx;
  }
  return highest;
}

/** True if chat already contains an introduction for this question index. */
export function messagesIncludeQuestion(
  messages: { role: string; content: string }[],
  index: number,
  total: number,
): boolean {
  const needle = `Question ${index + 1} of ${total}`;
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content.toLowerCase().includes(needle.toLowerCase()),
  );
}

/**
 * User turns after the assistant message that introduced the current
 * question (or after welcome if still on the opening).
 */
export function countFollowUpsOnCurrentQuestion(
  messages: { role: string; content: string }[],
  currentQuestionIndex: number,
  totalQuestions: number,
  onWelcome: boolean,
): number {
  if (onWelcome) return 0;
  let lastIntro = -1;
  const needle = `Question ${currentQuestionIndex + 1} of ${totalQuestions}`;
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]!;
    if (
      m.role === "assistant" &&
      m.content.toLowerCase().includes(needle.toLowerCase())
    ) {
      lastIntro = i;
    }
  }
  // No marker yet (e.g. Clara asked Q1 in prose after welcome) — count
  // user turns after the first assistant message.
  const start = lastIntro >= 0 ? lastIntro : 0;
  let count = 0;
  for (let i = start + 1; i < messages.length; i += 1) {
    if (messages[i]!.role === "user") count += 1;
  }
  return count;
}

export function looksLikeGuidedReflectContent(content: string): boolean {
  return (
    content.includes(GUIDED_REFLECT_PREAMBLE) ||
    /^### Question \d+ of \d+:/m.test(content)
  );
}

/** Prefixed block listing guided questions for the summarizer. */
export function formatGuidedPreamble(flow: ReflectFlow): string {
  const lines = [
    GUIDED_REFLECT_PREAMBLE,
    "",
    "**Guided reflection questions:**",
    ...flow.questions.map((q, i) => `${i + 1}. ${q}`),
  ];
  if (flow.welcome) {
    lines.push("", `**Welcome:** ${flow.welcome}`);
  }
  return lines.join("\n");
}
