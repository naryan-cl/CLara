/**
 * Map a MediaRecorder MIME type to the Storage object extension.
 * Why: phones (especially iOS) record AAC in an mp4 container, not WebM.
 * Whisper uses the filename extension to pick a decoder — calling an AAC
 * blob `.webm` is a common reason a short take “uploads fine” then fails.
 */
export function listensFileExtension(
  mimeType: string | null | undefined,
): "webm" | "m4a" {
  const mime = (mimeType ?? "").toLowerCase();
  if (
    mime.includes("mp4") ||
    mime.includes("m4a") ||
    mime.includes("aac") ||
    mime.includes("mpeg")
  ) {
    return "m4a";
  }
  return "webm";
}

/** Prefer MIME (phones lie about webm support) then the client-sent extension. */
export function listensStagingExtension(input: {
  fileExtension?: string | null;
  mimeType?: string | null;
}): "webm" | "m4a" {
  if (listensFileExtension(input.mimeType) === "m4a") return "m4a";
  const ext = (input.fileExtension ?? "").toLowerCase().replace(/^\./, "");
  if (ext === "m4a" || ext === "mp4" || ext === "aac") return "m4a";
  return "webm";
}
