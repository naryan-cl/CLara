/**
 * Hidden retry handle for Listens v2. Stored as an HTML comment after the
 * pending/failure placeholder so we can re-enqueue Whisper without a new
 * documents column. Successful transcripts drop the comment (audio is gone).
 */

export type ListensJobMeta = {
  recordingId: string;
  segmentCount: number;
  mimeType: string;
  fileExtension: "webm" | "m4a";
};

const META_OPEN = "<!-- clara-listens:";
const META_CLOSE = " -->";

export function encodeListensJobMeta(meta: ListensJobMeta): string {
  return `${META_OPEN}${JSON.stringify(meta)}${META_CLOSE}`;
}

export function withListensJobMeta(
  body: string,
  meta: ListensJobMeta,
): string {
  return `${stripListensJobMeta(body).trimEnd()}\n\n${encodeListensJobMeta(meta)}`;
}

export function stripListensJobMeta(content: string): string {
  const start = content.lastIndexOf(META_OPEN);
  if (start < 0) return content;
  const end = content.indexOf(META_CLOSE, start);
  if (end < 0) return content;
  return `${content.slice(0, start)}${content.slice(end + META_CLOSE.length)}`.trim();
}

export function parseListensJobMeta(content: string): ListensJobMeta | null {
  const start = content.lastIndexOf(META_OPEN);
  if (start < 0) return null;
  const end = content.indexOf(META_CLOSE, start);
  if (end < 0) return null;
  const raw = content.slice(start + META_OPEN.length, end).trim();
  try {
    const parsed = JSON.parse(raw) as Partial<ListensJobMeta>;
    const recordingId =
      typeof parsed.recordingId === "string" ? parsed.recordingId.trim() : "";
    const segmentCount = Number(parsed.segmentCount);
    const mimeType =
      typeof parsed.mimeType === "string" ? parsed.mimeType : "audio/webm";
    const fileExtension =
      parsed.fileExtension === "m4a" ? "m4a" : "webm";
    if (!recordingId || recordingId.includes("/")) return null;
    if (!Number.isInteger(segmentCount) || segmentCount < 1) return null;
    return { recordingId, segmentCount, mimeType, fileExtension };
  } catch {
    return null;
  }
}
