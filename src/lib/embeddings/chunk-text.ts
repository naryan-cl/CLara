export type ChunkTextOptions = {
  maxChars?: number;
  overlapChars?: number;
};

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;

/**
 * Split Markdown content into chunks along paragraph boundaries, each under
 * `maxChars`, carrying a small `overlapChars` tail from the previous chunk
 * forward so a thought split across a boundary isn't lost to retrieval. Pure
 * — no I/O, safe to call directly for manual testing.
 */
export function chunkText(
  content: string,
  options: ChunkTextOptions = {},
): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
  };

  for (const paragraph of paragraphs) {
    // A single paragraph longer than maxChars can't be packed at all —
    // hard-split it on its own rather than dropping/overflowing.
    if (paragraph.length > maxChars) {
      pushCurrent();
      current = "";
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    pushCurrent();
    const overlap = current.slice(-overlapChars).trim();
    current = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
  }

  pushCurrent();
  return chunks;
}
