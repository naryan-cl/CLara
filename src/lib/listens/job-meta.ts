/**
 * Hidden handle for Listens v2 audio in Storage. Stored as an HTML comment
 * after the transcript (or pending/failure placeholder) so Retry / playback
 * can find the files without a new documents column. Kept after a successful
 * transcript so a later Whisper miss does not lose the original recording.
 * Files are removed when the Commons document is deleted.
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

export function listensStagingPaths(
  streamId: string,
  meta: Pick<ListensJobMeta, "recordingId" | "segmentCount" | "fileExtension">,
): string[] {
  return Array.from(
    { length: meta.segmentCount },
    (_, i) => `${streamId}/${meta.recordingId}/${i}.${meta.fileExtension}`,
  );
}
