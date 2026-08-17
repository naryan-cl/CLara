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

/** OpenAI multipart uploads key off filename + a simple MIME (no codecs=). */
export type OpenAiAudioContainer = "webm" | "mp4" | "ogg" | "wav" | "mp3";

export type OpenAiAudioUploadMeta = {
  filename: string;
  mimeType: string;
  container: OpenAiAudioContainer | "unknown";
};

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * Read the file header, not the browser MIME. iOS/Chrome often claim
 * `audio/webm` then write AAC in an mp4 box.
 */
export function sniffAudioContainer(
  bytes: Uint8Array,
): OpenAiAudioContainer | null {
  if (bytes.length < 12) return null;

  // EBML / WebM / Matroska
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }

  // MP4 / M4A / AAC-in-mp4: 4-byte size then "ftyp"
  if (asciiAt(bytes, 4, 4) === "ftyp") return "mp4";

  if (asciiAt(bytes, 0, 4) === "OggS") return "ogg";
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WAVE") {
    return "wav";
  }
  if (asciiAt(bytes, 0, 3) === "ID3") return "mp3";
  // MPEG audio frame sync
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";

  return null;
}

function extensionFromFilename(filename: string | null | undefined): string {
  const name = (filename ?? "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).replace(/[^a-z0-9]/g, "");
}

function claimedContainer(input: {
  filename?: string | null;
  mimeType?: string | null;
}): OpenAiAudioContainer | "unknown" {
  const ext = extensionFromFilename(input.filename);
  if (ext === "m4a" || ext === "mp4" || ext === "aac") return "mp4";
  if (ext === "webm") return "webm";
  if (ext === "ogg" || ext === "oga") return "ogg";
  if (ext === "wav") return "wav";
  if (ext === "mp3" || ext === "mpeg" || ext === "mpga") return "mp3";
  if (listensFileExtension(input.mimeType) === "m4a") return "mp4";
  if ((input.mimeType ?? "").toLowerCase().includes("webm")) return "webm";
  return "unknown";
}

function metaForContainer(
  container: OpenAiAudioContainer | "unknown",
): OpenAiAudioUploadMeta {
  switch (container) {
    case "mp4":
      return { filename: "recording.m4a", mimeType: "audio/mp4", container };
    case "ogg":
      return { filename: "recording.ogg", mimeType: "audio/ogg", container };
    case "wav":
      return { filename: "recording.wav", mimeType: "audio/wav", container };
    case "mp3":
      return { filename: "recording.mp3", mimeType: "audio/mpeg", container };
    case "webm":
      return { filename: "recording.webm", mimeType: "audio/webm", container };
    default:
      return {
        filename: "recording.webm",
        mimeType: "audio/webm",
        container: "unknown",
      };
  }
}

/** Filename + MIME Whisper should see, based on bytes first then claims. */
export function openaiAudioUploadMeta(
  bytes: Uint8Array,
  claimed: { filename?: string | null; mimeType?: string | null } = {},
): OpenAiAudioUploadMeta {
  const sniffed = sniffAudioContainer(bytes);
  return metaForContainer(sniffed ?? claimedContainer(claimed));
}

/** The other container to try when OpenAI says the file could not be decoded. */
export function alternateAudioUploadMeta(
  primary: OpenAiAudioUploadMeta,
): OpenAiAudioUploadMeta {
  if (primary.container === "mp4") return metaForContainer("webm");
  return metaForContainer("mp4");
}

export function isLikelyAudioFormatError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("format") ||
    text.includes("decode") ||
    text.includes("codec") ||
    text.includes("invalid file") ||
    text.includes("unsupported") ||
    text.includes("corrupt") ||
    text.includes("could not be processed") ||
    text.includes("invalid audio")
  );
}
