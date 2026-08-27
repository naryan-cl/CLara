/** Parse CLara element / session summary Markdown into named sections. */

const SECTION_HEADINGS = [
  "Brief summary",
  "Highlights",
  "Balcony observations",
  "Tensions and polarities",
  "Key questions",
  "Theme tags",
  "What emerged",
  "Key insights",
  "Key quotes",
  "Meta",
  "Inquiries",
  "Tensions",
  "Resonance",
  "Shared themes",
  "Where we diverge",
  "Still open",
  "Suggested next inquiries",
];

const SECTION_RE = new RegExp(
  `^##\\s+(${SECTION_HEADINGS.map((h) =>
    h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})\\s*$`,
  "gim",
);

export function parseSummarySections(text) {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return { body: "", sections: {}, hasFrontmatter: false };
  }

  let body = raw;
  let hasFrontmatter = false;
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (frontmatterMatch) {
    body = frontmatterMatch[2].trim();
    hasFrontmatter = true;
  }

  const sections = {};
  const matches = [...body.matchAll(SECTION_RE)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const name = match[1];
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const content = body.slice(start, end).trim();
    const key = name.toLowerCase().replace(/\s+/g, "_");
    sections[key] = content;
  }

  return { body, sections, hasFrontmatter };
}

export function extractInquiryList(inquiriesText) {
  if (!inquiriesText?.trim()) return [];
  const lines = inquiriesText.split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    const text =
      bullet?.[1] ?? numbered?.[1] ?? (trimmed.endsWith("?") ? trimmed : null);
    if (text) items.push(text.trim());
    else if (trimmed.includes("?")) items.push(trimmed);
  }
  if (items.length === 0 && inquiriesText.includes("?")) {
    return inquiriesText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("?"));
  }
  return items;
}

export function sectionBlock(sessionName, eventId, content) {
  if (!content?.trim()) return "";
  return `\n\n### ${sessionName}\n<!-- session_id: ${eventId} -->\n\n${content.trim()}\n`;
}
