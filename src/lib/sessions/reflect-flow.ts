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
