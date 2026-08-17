/**
 * Compress a large uploaded audio file into Whisper-sized chunks.
 *
 * Why: OpenAI’s per-file cap is 25MB. A Voice Memo or Zoom export is often
 * bigger than that. We play the file through Web Audio (no speakers) and
 * re-record at Record’s 32kbps, rotating MediaRecorder every 12 minutes —
 * the same segment model Inngest already transcribes.
 *
 * Browser-only (Audio / MediaRecorder). Not used for files already ≤ 25MB.
 */

import {
  LISTENS_BITRATE,
  LISTENS_SEGMENT_SECONDS,
  MAX_LISTENS_SEGMENTS,
} from "@/lib/listens/constants";
import { listensFileExtension } from "@/lib/listens/audio-format";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const IOS_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/aac",
];

export type TranscodeProgress = {
  currentSeconds: number;
  durationSeconds: number;
};

export type TranscodeResult =
  | { ok: true; segments: Blob[]; mimeType: string }
  | { ok: false; error: string };

function isAppleTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = isAppleTouchDevice() ? IOS_MIME_CANDIDATES : MIME_CANDIDATES;
  const supported = candidates.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
  return supported ?? "";
}

function createRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  const attempts: MediaRecorderOptions[] = [];
  if (mimeType) {
    attempts.push({ mimeType, audioBitsPerSecond: LISTENS_BITRATE });
    attempts.push({ mimeType });
  }
  attempts.push({ audioBitsPerSecond: LISTENS_BITRATE });
  attempts.push({});
  for (const options of attempts) {
    try {
      if (
        options.mimeType &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        !MediaRecorder.isTypeSupported(options.mimeType)
      ) {
        continue;
      }
      return new MediaRecorder(stream, options);
    } catch {
      continue;
    }
  }
  return new MediaRecorder(stream);
}

function collectBlob(recorder: MediaRecorder, fallbackType: string): Promise<Blob> {
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) parts.push(event.data);
  };
  return new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Compression failed."));
    recorder.onstop = () => {
      resolve(
        new Blob(parts, { type: recorder.mimeType || fallbackType || "audio/webm" }),
      );
    };
  });
}

export async function transcodeAudioFileForWhisper(
  file: File,
  onProgress?: (progress: TranscodeProgress) => void,
): Promise<TranscodeResult> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return {
      ok: false,
      error:
        "This browser can’t compress large audio. Export an M4A/MP3 under 25MB, or use a computer.",
    };
  }

  const mimeType = pickMimeType();
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.setAttribute("playsinline", "true");
  audio.preload = "metadata";
  audio.src = objectUrl;
  audio.style.display = "none";
  document.body.appendChild(audio);

  let ctx: AudioContext | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () =>
        reject(new Error("This browser couldn’t read that audio file."));
    });

    const durationSeconds = audio.duration;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return {
        ok: false,
        error: "Couldn’t read the length of this audio file.",
      };
    }

    const maxSeconds = MAX_LISTENS_SEGMENTS * LISTENS_SEGMENT_SECONDS;
    if (durationSeconds > maxSeconds) {
      return {
        ok: false,
        error: `Audio is longer than ~${Math.round(maxSeconds / 60)} minutes. Split it, then upload the parts.`,
      };
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AudioCtx();
    await ctx.resume().catch(() => {});

    const source = ctx.createMediaElementSource(audio);
    const destination = ctx.createMediaStreamDestination();
    source.connect(destination);

    const blobPromises: Promise<Blob>[] = [];
    let recorder = createRecorder(destination.stream, mimeType);
    blobPromises.push(collectBlob(recorder, mimeType));
    recorder.start();

    const rotateMs = LISTENS_SEGMENT_SECONDS * 1000;
    const rotateTimer = window.setInterval(() => {
      if (audio.ended || audio.paused) return;
      if (recorder.state !== "recording") return;
      if (blobPromises.length >= MAX_LISTENS_SEGMENTS) return;
      recorder.stop();
      recorder = createRecorder(destination.stream, mimeType);
      blobPromises.push(collectBlob(recorder, mimeType));
      recorder.start();
    }, rotateMs);

    audio.ontimeupdate = () => {
      onProgress?.({
        currentSeconds: audio.currentTime,
        durationSeconds,
      });
    };

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () =>
        reject(new Error("Playback failed while compressing the audio."));
      void audio.play().catch((err) => {
        reject(
          err instanceof Error
            ? err
            : new Error("Couldn’t start compression. Tap Receive again."),
        );
      });
    });

    window.clearInterval(rotateTimer);
    if (recorder.state === "recording" || recorder.state === "paused") {
      recorder.stop();
    }

    const segments = (await Promise.all(blobPromises)).filter(
      (blob) => blob.size > 2048,
    );
    if (segments.length === 0) {
      return {
        ok: false,
        error:
          "Compression produced an empty file. Try exporting M4A/MP3 under 25MB.",
      };
    }

    const actualMime =
      segments[0]?.type || mimeType || "audio/webm";
    return { ok: true, segments, mimeType: actualMime };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.message.trim()
          ? err.message
          : "Couldn’t compress this audio in the browser. Export M4A/MP3 under 25MB.",
    };
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio.remove();
    URL.revokeObjectURL(objectUrl);
    if (ctx) {
      void ctx.close().catch(() => {});
    }
  }
}
