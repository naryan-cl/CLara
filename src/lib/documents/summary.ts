import {
  isListensFailureBody,
  isListensPendingBody,
} from "@/lib/listens/placeholders";
import { stripListensJobMeta } from "@/lib/listens/job-meta";

/** How long a fresh doc may still be summarizing before we stop the pill. */
export const SUMMARIZING_WINDOW_MS = 180_000;

/**
 * Label for the "original" tab next to Summary.
 * Why: a transcript, a reflection, and an upload are all `documents.content`,
 * but the tab should name what the person actually wrote or recorded.
 */
export function sourceTabLabel(type: string | null | undefined): string {
  switch (type) {
    case "Transcript":
      return "Transcript";
    case "Reflection":
      return "Reflection";
    case "Note":
      return "Uploaded text";
    case "Summary":
      return "Full text";
    default:
      return "Original";
  }
}

function bodyOf(content: string): string {
  return stripListensJobMeta(content).trim();
}

export function isUnsummarizableContent(content: string): boolean {
  const body = bodyOf(content);
  if (!body) return true;
  if (isListensPendingBody(body) || isListensFailureBody(body)) return true;
  if (body.startsWith("_Automatic text extraction failed")) return true;
  return false;
}

/**
 * True when the Inngest job should write `documents.summary`.
 * Session synthesis docs (type Summary) copy content — no extra LLM call.
 */
export function shouldGenerateSummary(doc: {
  type?: string | null;
  content: string;
  is_draft?: boolean | null;
}): boolean {
  if (doc.is_draft) return false;
  if (isUnsummarizableContent(doc.content)) return false;
  return true;
}

export function hasSummaryText(summary: string | null | undefined): boolean {
  return Boolean(summary?.trim());
}

/** True when the UI should still wait for (or backfill) a per-element summary. */
export function needsElementSummary(doc: {
  type?: string | null;
  content: string;
  summary?: string | null;
  is_draft?: boolean | null;
}): boolean {
  if (doc.type === "Summary") {
    // Gathering synthesis: the body *is* the summary.
    return false;
  }
  if (!shouldGenerateSummary(doc)) return false;
  return !hasSummaryText(doc.summary);
}

export function mergeAttendeeNames(
  attendeeNames: string[],
  extraNames: string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...attendeeNames, ...extraNames]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}
