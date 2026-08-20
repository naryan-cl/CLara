/** Appended when LLM input was cut to stay within char caps. */
export const TRUNCATION_NOTE =
  "\n\n---\n\n> **Note:** Source material was truncated; this summary may not cover the full recording or document.\n";

export function appendTruncationNote(
  markdown: string,
  wasTruncated: boolean,
): string {
  if (!wasTruncated) return markdown;
  return `${markdown}${TRUNCATION_NOTE}`;
}

export function truncateWithFlag(
  text: string,
  maxChars: number,
): { text: string; wasTruncated: boolean } {
  if (text.length <= maxChars) {
    return { text, wasTruncated: false };
  }
  return { text: text.slice(0, maxChars), wasTruncated: true };
}
