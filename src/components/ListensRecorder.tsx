"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveListensRecording } from "@/app/(app)/sessions/listens-actions";
import { MAX_AUDIO_BYTES } from "@/lib/openai/transcribe";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** Soft warning so a long recording doesn't silently blow past the size cap. */
const WARN_AT_SECONDS = 12 * 60;
/** Hard stop — we can't know encoded byte size until the recorder stops. */
const AUTO_STOP_SECONDS = 15 * 60;

function pickMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ListensRecorder() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Belt-and-suspenders: release the mic if the user navigates away mid-recording.
  useEffect(() => stopTracks, [stopTracks]);

  const submitRecording = useCallback(
    (blob: Blob, mimeType: string) => {
      if (blob.size === 0) {
        setError("No audio captured. Try again.");
        return;
      }
      if (blob.size > MAX_AUDIO_BYTES) {
        setError(
          `Recording is too large (${Math.round(blob.size / 1024 / 1024)}MB, max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB for this first Listens path). Try a shorter clip.`,
        );
        return;
      }

      const extension = mimeType.includes("mp4") ? "m4a" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `listens-recording.${extension}`);
      formData.append("title", title);

      startTransition(async () => {
        const result = await receiveListensRecording(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(
          result.needsReview
            ? "Transcribed — saved with needs_review (missing metadata)."
            : "Transcribed — saved to the Commons.",
        );
        setTitle("");
        router.refresh();
      });
    },
    [router, startTransition, title],
  );

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  // Live timer + soft warning / hard auto-stop, since we only learn the
  // actual encoded byte size once recording stops.
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= AUTO_STOP_SECONDS) {
          stopRecording();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, stopRecording]);

  async function startRecording() {
    setError(null);
    setMessage(null);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Recording isn't supported in this browser yet.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
    } catch {
      setError(
        "Mic access was blocked. Check your browser's site permissions and try again.",
      );
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 32_000,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      stopTracks();
      submitRecording(blob, mimeType);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setElapsedSeconds(0);
    setIsRecording(true);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          CLara Listens
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Record a short reflection with your mic — CLara transcribes it and
          saves it to the Commons as a Transcript. This first path is capped
          at roughly 15 minutes.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title (optional)</span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isRecording || pending}
          placeholder="Defaults to the recording date/time"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink disabled:opacity-60"
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-60 ${
            isRecording ? "bg-danger" : "bg-forest"
          }`}
        >
          {isRecording ? "Stop recording" : "Start recording"}
        </button>

        {isRecording ? (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <span className="h-2 w-2 animate-pulse rounded-pill bg-danger motion-reduce:animate-none" />
            <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
            {elapsedSeconds >= WARN_AT_SECONDS ? (
              <span className="text-warning">
                Nearing the {Math.round(AUTO_STOP_SECONDS / 60)}-min cap —
                wrap up soon
              </span>
            ) : null}
          </div>
        ) : null}

        {pending ? (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <span className="h-2 w-2 animate-pulse rounded-pill bg-glow shadow-glow motion-reduce:animate-none" />
            <span>Transcribing…</span>
          </div>
        ) : null}
      </div>

      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
    </div>
  );
}
