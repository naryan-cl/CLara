/**
 * Strip trailing Whisper “credit” hallucinations.
 *
 * Why: Whisper was trained on a lot of captions and auto-transcripts. When a
 * take ends in silence (or a phone froze the tab), it often invents a footer
 * such as “Transcribed by Otter” or “Thanks for watching.” We only touch the
 * *end* of the transcript so a real mid-take sentence is left alone.
 */

const ARTIFACT_CORE =
  "(?:" +
  [
    "transcribed by\\s+otter(?:\\.ai)?",
    "transcribed by\\s+https?:\\/\\/(?:www\\.)?otter\\.ai",
    "https?:\\/\\/(?:www\\.)?otter\\.ai",
    "subtitles? by\\s+(?:the\\s+)?amara(?:\\.org)?(?:\\s+community)?",
    "captions? (?:provided )?by\\s+(?:the\\s+)?amara(?:\\.org)?(?:\\s+community)?",
    "thanks? for watching",
    "thanks? for listening",
    "please\\s+(?:like(?:\\s*(?:and|&)\\s*)?)?subscribe",
    "(?:don't|do not)\\s+forget to\\s+(?:like\\s*(?:and|&)\\s*)?subscribe",
    "like and subscribe",
  ].join("|") +
  ")";

const WHOLE_LINE = new RegExp(`^${ARTIFACT_CORE}[.!…]*$`, "i");
const TRAILING = new RegExp(
  `([\\s.!?…]+)?(?:[_*~\`]*)${ARTIFACT_CORE}(?:[_*~\`]*)[.!…]*\\s*$`,
  "i",
);

/** Remove known Whisper credit lines from the end of Commons markdown. */
export function stripWhisperArtifacts(markdown: string): string {
  let current = markdown.replace(/\s+$/g, "");
  if (!current.trim()) return "";

  for (let i = 0; i < 8; i++) {
    const next = stripOnce(current);
    if (next === current) break;
    current = next;
  }
  return current.trim();
}

function stripOnce(markdown: string): string {
  const blocks = markdown.split(/\n{2,}/);
  const last = blocks[blocks.length - 1];
  if (last == null) return "";

  const { header, body } = splitTranscriptBlock(last);
  const strippedBody = stripTrailingFromBody(body);

  if (!strippedBody) {
    blocks.pop();
    return blocks.join("\n\n").trim();
  }
  if (strippedBody === body.trim()) {
    return markdown;
  }

  blocks[blocks.length - 1] = header ? `${header}\n${strippedBody}` : strippedBody;
  return blocks.join("\n\n");
}

function splitTranscriptBlock(block: string): {
  header: string | null;
  body: string;
} {
  const speaker = block.match(/^(\*\*[^*]+\*\* · \[\d+:[\d:]+\])\n([\s\S]*)$/);
  if (speaker) {
    return { header: speaker[1] ?? null, body: speaker[2] ?? "" };
  }
  const clock = block.match(/^(\[\d+:[\d:]+\])\n([\s\S]*)$/);
  if (clock) {
    return { header: clock[1] ?? null, body: clock[2] ?? "" };
  }
  return { header: null, body: block };
}

function stripTrailingFromBody(body: string): string {
  let current = body.trim();
  for (let i = 0; i < 8; i++) {
    if (!current) return "";
    if (WHOLE_LINE.test(unwrapMarkdown(current))) return "";

    const match = current.match(TRAILING);
    if (!match || match.index == null) break;
    if (match[0].length === 0) break;

    let kept = current.slice(0, match.index).trim();
    const sep = match[1] ?? "";
    if (kept && /[.!?…]/.test(sep) && !/[.!?…]$/.test(kept)) {
      const punct = sep.trim().charAt(0);
      if (punct) kept += punct;
    }
    if (kept === current) break;
    current = kept;
  }
  return current;
}

function unwrapMarkdown(text: string): string {
  return text.replace(/^[_*~`]+|[_*~`]+$/g, "").trim();
}
