import { displayLabel, looksEmpty, normalizeLabel } from "./normalize";

/**
 * Pull theme tags, tensions, and questions out of a per-element summary
 * brief (see DEFAULT_SUMMARIZE_SYSTEM_PROMPT). Fail-soft: unknown headings
 * are ignored so older free-form summaries still contribute what they can.
 */

export type ParsedSummary = {
  themeTags: string[];
  tensions: string[];
  questions: string[];
};

type SectionKind = "tags" | "tensions" | "questions";

function classifyHeading(heading: string): SectionKind | null {
  const text = normalizeLabel(heading);
  if (!text) return null;
  if (/(theme )?tags?/.test(text) && !/questions?/.test(text)) return "tags";
  if (/tensions?|polarit/.test(text)) return "tensions";
  if (/questions?|inquir/.test(text)) return "questions";
  return null;
}

function splitSections(
  markdown: string,
): { kind: SectionKind; body: string }[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: { kind: SectionKind; body: string }[] = [];
  let current: SectionKind | null = null;
  let body: string[] = [];

  function flush() {
    if (!current) return;
    sections.push({ kind: current, body: body.join("\n") });
    body = [];
  }

  for (const line of lines) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) {
      flush();
      current = classifyHeading(heading[1] ?? "");
      continue;
    }
    if (current) body.push(line);
  }
  flush();
  return sections;
}

function uniqueKeepOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeLabel(value);
    if (!key || seen.has(key) || looksEmpty(value)) continue;
    seen.add(key);
    out.push(displayLabel(value));
  }
  return out;
}

function inlineCode(body: string): string[] {
  return [...body.matchAll(/`([^`]+)`/g)]
    .map((match) => displayLabel(match[1] ?? ""))
    .filter(Boolean);
}

function listItems(body: string): string[] {
  const items: string[] = [];
  for (const line of body.split("\n")) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet?.[1]) items.push(displayLabel(bullet[1]));
  }
  return items;
}

function commaTags(body: string): string[] {
  const compact = body.replace(/\n+/g, " ").trim();
  if (!compact || compact.length > 400) return [];
  if (!compact.includes(",") && !compact.includes("`")) return [];
  return compact
    .split(/[,;]+/)
    .map((part) => displayLabel(part))
    .filter(Boolean);
}

function itemsForSection(kind: SectionKind, body: string): string[] {
  const code = inlineCode(body);
  const bullets = listItems(body);

  if (kind === "tags") {
    if (code.length > 0) return uniqueKeepOrder(code);
    if (bullets.length > 0) return uniqueKeepOrder(bullets);
    return uniqueKeepOrder(commaTags(body));
  }

  if (bullets.length > 0) return uniqueKeepOrder(bullets);

  const leftover = displayLabel(body);
  return leftover && !looksEmpty(leftover) ? uniqueKeepOrder([leftover]) : [];
}

export function parseSummaryBrief(
  markdown: string | null | undefined,
): ParsedSummary {
  const empty: ParsedSummary = { themeTags: [], tensions: [], questions: [] };
  if (!markdown || !markdown.trim()) return empty;

  const parsed = { ...empty };
  for (const section of splitSections(markdown)) {
    const items = itemsForSection(section.kind, section.body);
    if (section.kind === "tags") parsed.themeTags.push(...items);
    if (section.kind === "tensions") parsed.tensions.push(...items);
    if (section.kind === "questions") parsed.questions.push(...items);
  }

  return {
    themeTags: uniqueKeepOrder(parsed.themeTags),
    tensions: uniqueKeepOrder(parsed.tensions),
    questions: uniqueKeepOrder(parsed.questions),
  };
}

/**
 * Turn a tension bullet into a polarity pair when the writer used vs / versus.
 * "Speed vs depth — we kept oscillating" → ["Speed", "depth"].
 */
export function splitPolarity(text: string): [string, string] | null {
  const parts = text.split(/\s+(?:vs\.?|versus|v\.)\s+/i);
  if (parts.length < 2) return null;
  const left = displayLabel(parts[0] ?? "");
  const right = displayLabel(
    (parts[1] ?? "").split(/\s+[—–]\s+/)[0] ?? "",
  );
  if (!left || !right) return null;
  if (left.length > 80 || right.length > 80) return null;
  if (normalizeLabel(left) === normalizeLabel(right)) return null;
  return [left, right];
}
