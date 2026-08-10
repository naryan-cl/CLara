/**
 * Pure helpers: turn Whisper / diarize segments into readable Markdown.
 * Kept free of I/O so we can reason about formatting without calling OpenAI.
 */

export type TranscriptSegment = {
  /** Speaker label from the API ("A", "B") or a real name after mapping. */
  speaker: string | null;
  /** Start time within this audio chunk (seconds). */
  start: number;
  text: string;
};

/** Format seconds as [M:SS] or [H:MM:SS] for transcript headers. */
export function formatClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/**
 * Merge adjacent segments that share the same speaker so a turn is one
 * paragraph instead of many tiny lines.
 */
export function mergeAdjacentSegments(
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    const sameSpeaker = prev && (prev.speaker ?? "") === (seg.speaker ?? "");
    if (sameSpeaker && prev) {
      prev.text = `${prev.text.trim()} ${text}`;
    } else {
      out.push({ speaker: seg.speaker, start: seg.start, text });
    }
  }
  return out;
}

/**
 * Build Commons Markdown from timed (and optionally speaker-labeled) segments.
 * `timeOffsetSeconds` shifts clocks for Listens multi-chunk recordings.
 */
export function formatTranscriptMarkdown(
  segments: TranscriptSegment[],
  timeOffsetSeconds = 0,
): string {
  const merged = mergeAdjacentSegments(segments);
  if (merged.length === 0) return "";

  const blocks = merged.map((seg) => {
    const clock = formatClock(seg.start + timeOffsetSeconds);
    const body = seg.text.trim();
    if (seg.speaker) {
      return `**${seg.speaker}** · [${clock}]\n${body}`;
    }
    return `[${clock}]\n${body}`;
  });

  return blocks.join("\n\n");
}

/** Collect unique speaker labels in first-appearance order. */
export function listSpeakerLabels(markdown: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const re = /^\*\*([^*]+)\*\* · \[/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const label = match[1].trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    ordered.push(label);
  }
  return ordered;
}

/**
 * Replace `**Old** · [` headers using a label → display-name map.
 * Unknown labels are left unchanged.
 */
export function applySpeakerNameMap(
  markdown: string,
  nameByLabel: Record<string, string>,
): string {
  if (Object.keys(nameByLabel).length === 0) return markdown;
  return markdown.replace(/^\*\*([^*]+)\*\* · \[/gm, (full, label: string) => {
    const mapped = nameByLabel[label.trim()];
    if (!mapped) return full;
    return `**${mapped}** · [`;
  });
}

/**
 * When only one known participant is on the session, attribute every turn to
 * them (common for solo reflections / voice memos).
 */
export function attributeAllSpeakers(
  markdown: string,
  displayName: string,
): string {
  const name = displayName.trim();
  if (!name) return markdown;
  const labels = listSpeakerLabels(markdown);
  if (labels.length === 0) {
    // Timestamp-only transcript: prefix a single speaker on each block.
    return markdown.replace(/^\[(\d+:[\d:]+)\]\n/gm, `**${name}** · [$1]\n`);
  }
  const map: Record<string, string> = {};
  for (const label of labels) {
    map[label] = name;
  }
  return applySpeakerNameMap(markdown, map);
}
