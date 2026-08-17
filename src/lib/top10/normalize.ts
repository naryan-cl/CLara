/**
 * Shared string cleanup for Top 10 clustering.
 * Why a separate file: ranking should treat "Trust", "trust", and "trust?"
 * as the same idea without the UI having to know those rules.
 */

const EMPTY_SIGNAL =
  /^(none|nothing)( (stood out|found|noted|emerged|present|here|detected))?$|^(n\/a|na|not applicable)$|^no (clear |obvious |notable )?(tensions?|polarities|questions?|themes?|tags?)( (stood out|found|noted|emerged|present|here))?$/;

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

/** Lowercase, strip wrapping punctuation/markdown, collapse spaces. */
export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[`*_~]+/g, "")
    .replace(/[“”"']/g, "")
    .replace(/^[?!.,;:\-–—\s]+/, "")
    .replace(/[?!.,;:\-–—\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksEmpty(text: string): boolean {
  const normalized = normalizeLabel(text);
  if (!normalized) return true;
  if (normalized.length < 2) return true;
  return EMPTY_SIGNAL.test(normalized);
}

/** Display text: keep original voice, just tidy markdown noise. */
export function displayLabel(raw: string): string {
  const cleaned = raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return raw.trim();
  return cleaned.length > 140 ? `${cleaned.slice(0, 137).trimEnd()}…` : cleaned;
}

export function documentHref(id: string): string {
  return `/sessions/documents/${id}`;
}

export function sessionHref(id: string): string {
  return `/sessions/archive/${id}`;
}

export function documentTitle(
  title: string | null | undefined,
  type: string | null | undefined,
): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  switch (type) {
    case "Reflection":
      return "Untitled reflection";
    case "Transcript":
      return "Untitled transcript";
    case "Note":
      return "Untitled note";
    case "Summary":
      return "Session summary";
    default:
      return "Untitled";
  }
}

export function documentTypeLabel(type: string | null | undefined): string {
  if (!type || !type.trim()) return "Commons";
  return type.trim();
}
