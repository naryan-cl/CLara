/**
 * Pure helpers: turn Whisper / diarize segments into readable Markdown.
 * Kept free of I/O so we can reason about formatting without calling OpenAI.
 */

export type TranscriptSegment = {
  /** Speaker label from the API ("A", "B") or a real name after mapping. */
  speaker: string | null;
  /** Start time within this audio chunk (seconds). */
  start: number;
  /** End time when the API provides it (seconds). Used to detect pauses. */
  end?: number;
  text: string;
};

/**
 * Pause longer than this starts a new paragraph even if the speaker label
 * did not change (overlap / missed turn).
 */
export const TRANSCRIPT_TURN_GAP_SECONDS = 2.5;

/**
 * Whisper (no speaker labels) returns contiguous segments. Merging those
 * used to glue a whole ~12-minute upload chunk into one wall of text.
 * Cap unlabeled blocks so clocks stay frequent enough to scan.
 */
export const MAX_UNLABELED_BLOCK_SECONDS = 20;

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

function segmentEnd(seg: TranscriptSegment): number {
  if (typeof seg.end === "number" && Number.isFinite(seg.end)) {
    return seg.end;
  }
  return seg.start;
}

function shouldMergeWithPrevious(
  prev: TranscriptSegment,
  next: TranscriptSegment,
): boolean {
  const sameSpeaker = (prev.speaker ?? "") === (next.speaker ?? "");
  if (!sameSpeaker) return false;

  const gap = next.start - segmentEnd(prev);
  if (gap > TRANSCRIPT_TURN_GAP_SECONDS) return false;

  const unlabeled = !prev.speaker && !next.speaker;
  if (unlabeled) {
    const nextEnd = segmentEnd(next);
    const blockSpan = Math.max(nextEnd, next.start) - prev.start;
    if (blockSpan > MAX_UNLABELED_BLOCK_SECONDS) return false;
  }

  return true;
}

/**
 * Merge adjacent fragments of the same turn into one paragraph.
 * Unlabeled Whisper segments stay split on pauses and every ~20s so
 * multi-speaker audio that fell back from diarize is still scannable.
 */
export function mergeAdjacentSegments(
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const next: TranscriptSegment = {
      speaker: seg.speaker,
      start: seg.start,
      end: typeof seg.end === "number" ? seg.end : undefined,
      text,
    };
    const prev = out[out.length - 1];
    if (prev && shouldMergeWithPrevious(prev, next)) {
      prev.text = `${prev.text.trim()} ${text}`;
      prev.end = segmentEnd(next);
    } else {
      out.push(next);
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
 * Attribute turns to one person only when the audio looks like a solo take:
 * timestamp-only blocks, or a single diarized label. If diarize found
 * Speaker A/B/C, leave those labels — a group recording may be linked to a
 * session that only lists the uploader.
 */
export function attributeAllSpeakers(
  markdown: string,
  displayName: string,
): string {
  const name = displayName.trim();
  if (!name) return markdown;
  const labels = listSpeakerLabels(markdown);
  if (labels.length > 1) return markdown;
  if (labels.length === 0) {
    return markdown.replace(/^\[(\d+:[\d:]+)\]\n/gm, `**${name}** · [$1]\n`);
  }
  const onlyLabel = labels[0];
  if (!onlyLabel) return markdown;
  return applySpeakerNameMap(markdown, { [onlyLabel]: name });
}
