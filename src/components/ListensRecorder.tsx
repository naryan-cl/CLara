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

/** How many vertical bars to draw in the live waveform. */
const WAVEFORM_BARS = 40;

function pickMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  return (
    MIME_CANDIDATES.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? null
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function quietBars() {
  return Array.from({ length: WAVEFORM_BARS }, () => 0.08);
}

function peakFromTimeDomain(data: Uint8Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const deviation = Math.abs(data[i]! - 128) / 128;
    if (deviation > peak) peak = deviation;
  }
  return peak;
}

function barsFromFrequency(data: Uint8Array): number[] {
  const nextBars: number[] = [];
  const binsPerBar = Math.max(1, Math.floor(data.length / WAVEFORM_BARS));
  for (let b = 0; b < WAVEFORM_BARS; b++) {
    let sum = 0;
    const start = b * binsPerBar;
    for (let i = 0; i < binsPerBar; i++) {
      sum += data[start + i] ?? 0;
    }
    const avg = sum / binsPerBar / 255;
    nextBars.push(Math.max(0.08, Math.min(1, avg * 1.4)));
  }
  return nextBars;
}

/**
 * Browser share picker for tab/window/system audio.
 * Video is requested only because Chromium needs it to show the picker;
 * we discard video tracks immediately and keep audio.
 */
async function requestSystemTabAudio(): Promise<
  { ok: true; stream: MediaStream } | { ok: false; error: string }
> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return {
      ok: false,
      error:
        "System/tab audio isn’t supported in this browser. Try Chrome or Edge.",
    };
  }

  try {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    // We only need sound — stop the screen/tab video track right away.
    for (const track of display.getVideoTracks()) {
      track.stop();
    }

    const audioTracks = display.getAudioTracks();
    if (audioTracks.length === 0) {
      for (const track of display.getTracks()) track.stop();
      return {
        ok: false,
        error:
          "No audio was shared. In the browser picker, choose a tab or screen and turn on “Share audio” / “Share system audio”.",
      };
    }

    return { ok: true, stream: new MediaStream(audioTracks) };
  } catch {
    return {
      ok: false,
      error: "System/tab share was cancelled or blocked.",
    };
  }
}

/**
 * Listens recorder: mic (+ optional system/tab audio mixed via Web Audio),
 * separate level meters, live waveform, pause/resume, Submit → Commons doc.
 */
export function ListensRecorder({
  sessionIds = [],
}: {
  sessionIds?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(false);
  /** True once a system/tab stream is actually attached this take. */
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(quietBars);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const systemAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  const stopMeterLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const runMeterLoop = useCallback(() => {
    stopMeterLoop();

    const micAnalyser = micAnalyserRef.current;
    if (!micAnalyser) return;

    const micTime = new Uint8Array(micAnalyser.fftSize);
    const micFreq = new Uint8Array(micAnalyser.frequencyBinCount);
    const sysTimeBuf = new Uint8Array(micAnalyser.fftSize);
    const sysFreqBuf = new Uint8Array(micAnalyser.frequencyBinCount);

    const tick = () => {
      const micNode = micAnalyserRef.current;
      if (!micNode) return;

      micNode.getByteTimeDomainData(micTime);
      micNode.getByteFrequencyData(micFreq);
      setMicLevel(peakFromTimeDomain(micTime));

      const systemNode = systemAnalyserRef.current;
      let waveFreq = micFreq;
      if (systemNode) {
        systemNode.getByteTimeDomainData(sysTimeBuf);
        systemNode.getByteFrequencyData(sysFreqBuf);
        setSystemLevel(peakFromTimeDomain(sysTimeBuf));
        // Waveform = louder of mic vs system per bin so both sources show up.
        const combined = new Uint8Array(micFreq.length);
        for (let i = 0; i < micFreq.length; i++) {
          combined[i] = Math.max(micFreq[i]!, sysFreqBuf[i]!);
        }
        waveFreq = combined;
      } else {
        setSystemLevel(0);
      }

      setBars(barsFromFrequency(waveFreq));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopMeterLoop]);

  const stopAllTracks = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    systemStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    systemStreamRef.current = null;
  }, []);

  const disposeGraph = useCallback(() => {
    stopMeterLoop();
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    micAnalyserRef.current = null;
    systemAnalyserRef.current = null;
    setMicLevel(0);
    setSystemLevel(0);
    setBars(quietBars());
    setSystemAudioActive(false);
  }, [stopMeterLoop]);

  const teardownCapture = useCallback(() => {
    disposeGraph();
    stopAllTracks();
    mediaRecorderRef.current = null;
  }, [disposeGraph, stopAllTracks]);

  useEffect(() => () => teardownCapture(), [teardownCapture]);

  /**
   * Build Web Audio graph: mic (+ optional system) → per-source analysers + mix destination.
   * MediaRecorder records the mixed destination stream (one file for Whisper).
   * Waveform meters read each source analyser — we never loop destination.stream
   * back into the graph (that can feedback or stay silent in some browsers).
   */
  const buildCaptureGraph = useCallback(
    (micStream: MediaStream, systemStream: MediaStream | null) => {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const destination = ctx.createMediaStreamDestination();

      const micSource = ctx.createMediaStreamSource(micStream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.7;
      micSource.connect(micAnalyser);
      micSource.connect(destination);

      let systemAnalyser: AnalyserNode | null = null;
      if (systemStream && systemStream.getAudioTracks().length > 0) {
        const systemSource = ctx.createMediaStreamSource(systemStream);
        systemAnalyser = ctx.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemAnalyser.smoothingTimeConstant = 0.7;
        systemSource.connect(systemAnalyser);
        systemSource.connect(destination);
      }

      audioContextRef.current = ctx;
      micAnalyserRef.current = micAnalyser;
      systemAnalyserRef.current = systemAnalyser;
      void ctx.resume().catch(() => {});
      runMeterLoop();

      return destination.stream;
    },
    [runMeterLoop],
  );

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
      formData.append("title", titleRef.current);
      if (sessionIds.length > 0) {
        formData.append("sessionIds", sessionIds.join(","));
      }

      startTransition(async () => {
        const result = await receiveListensRecording(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setTitle("");
        router.push(`/sessions/documents/${result.documentId}`);
        router.refresh();
      });
    },
    [router, sessionIds],
  );

  const submitRecordingRef = useRef(submitRecording);
  submitRecordingRef.current = submitRecording;

  const stopAndSubmit = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (typeof recorder.pause !== "function") {
      setError("Pause isn’t supported in this browser. You can still Submit.");
      return;
    }
    recorder.pause();
    setIsPaused(true);
    stopMeterLoop();
    setMicLevel(0);
    setSystemLevel(0);
    setBars(quietBars());
  }, [stopMeterLoop]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setIsPaused(false);
    void audioContextRef.current?.resume().catch(() => {});
    runMeterLoop();
  }, [runMeterLoop]);

  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= AUTO_STOP_SECONDS) {
          stopAndSubmit();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, stopAndSubmit]);

  async function startRecording() {
    setError(null);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Recording isn't supported in this browser yet.");
      return;
    }

    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
      });
    } catch {
      setError(
        "Mic access was blocked. Check your browser's site permissions and try again.",
      );
      return;
    }

    let systemStream: MediaStream | null = null;
    if (includeSystemAudio) {
      const systemResult = await requestSystemTabAudio();
      if (!systemResult.ok) {
        micStream.getTracks().forEach((track) => track.stop());
        setError(systemResult.error);
        return;
      }
      systemStream = systemResult.stream;
      // If the user stops sharing mid-take, drop the system meter but keep mic.
      systemStream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          systemAnalyserRef.current = null;
          setSystemAudioActive(false);
          setSystemLevel(0);
        });
      });
    }

    micStreamRef.current = micStream;
    systemStreamRef.current = systemStream;
    chunksRef.current = [];

    const recordStream = buildCaptureGraph(micStream, systemStream);

    const recorder = new MediaRecorder(recordStream, {
      mimeType,
      audioBitsPerSecond: 32_000,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      teardownCapture();
      submitRecordingRef.current(blob, mimeType);
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
    setSystemAudioActive(Boolean(systemStream));
    setElapsedSeconds(0);
    setIsPaused(false);
    setIsRecording(true);
  }

  const busy = pending;
  const showViz = isRecording || busy;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          CLara Listens
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Record with your mic, optionally plus tab/system audio (Zoom, a
          browser tab, etc.). CLara mixes them, transcribes, and saves a
          Commons Transcript (~15 min cap).
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title</span>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isRecording || busy}
          placeholder="Defaults to the recording date/time"
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink disabled:opacity-60"
        />
      </label>

      <label className="flex items-start gap-2 text-sm text-ink/80">
        <input
          type="checkbox"
          className="mt-1"
          checked={includeSystemAudio}
          disabled={isRecording || busy}
          onChange={(event) => setIncludeSystemAudio(event.target.checked)}
        />
        <span>
          <span className="font-medium text-ink">Include system/tab audio</span>
          <span className="mt-0.5 block text-ink/55">
            After Start, your browser asks what to share. Pick a Zoom window or
            browser tab and enable <em>Share audio</em>. Mic and system each get
            their own volume meter.
          </span>
        </span>
      </label>

      {showViz ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-cloud bg-sand/40 px-4 py-3"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-ink/70">
              <span
                className={`h-2 w-2 rounded-pill ${
                  isPaused
                    ? "bg-ink/35"
                    : "animate-pulse bg-danger motion-reduce:animate-none"
                }`}
              />
              <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
              <span className="text-ink/45">
                {busy ? "Transcribing…" : isPaused ? "Paused" : "Recording"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 sm:items-end">
              <VolumeMeter
                label="Mic"
                level={isPaused || busy ? 0 : micLevel}
              />
              {systemAudioActive ? (
                <VolumeMeter
                  label="System"
                  level={isPaused || busy ? 0 : systemLevel}
                  tone="horizon"
                />
              ) : null}
            </div>
          </div>

          <WaveformBars bars={isPaused || busy ? quietBars() : bars} />

          {elapsedSeconds >= WARN_AT_SECONDS && !busy ? (
            <p className="text-sm text-warning">
              Nearing the {Math.round(AUTO_STOP_SECONDS / 60)}-min cap — wrap up
              soon
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!isRecording && !busy ? (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
          >
            Start recording
          </button>
        ) : null}

        {isRecording && !busy ? (
          <>
            <button
              type="button"
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="rounded-md border border-forest px-4 py-2 text-sm font-medium text-forest hover:bg-forest/5"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={stopAndSubmit}
              className="btn-primary rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
            >
              Submit
            </button>
          </>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <span className="h-2 w-2 animate-pulse rounded-pill bg-glow shadow-glow motion-reduce:animate-none" />
            <span>Transcribing and opening in Commons…</span>
          </div>
        ) : null}
      </div>

      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function VolumeMeter({
  label,
  level,
  tone = "forest",
}: {
  label: string;
  level: number;
  tone?: "forest" | "horizon";
}) {
  const pct = Math.round(Math.min(1, level * 1.8) * 100);
  const fill =
    tone === "horizon" ? "bg-horizon" : "bg-forest";
  return (
    <div
      className="flex items-center gap-2"
      title={`${label} input level`}
      aria-label={`${label} level ${pct}%`}
    >
      <span className="w-14 font-mono text-[10px] uppercase tracking-wide text-ink/40">
        {label}
      </span>
      <div className="h-2 w-24 overflow-hidden rounded-pill bg-cloud">
        <div
          className={`h-full rounded-pill transition-[width] duration-75 ease-out ${fill}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WaveformBars({ bars }: { bars: number[] }) {
  return (
    <div
      className="flex h-14 items-end gap-[3px]"
      role="img"
      aria-label="Live audio waveform"
    >
      {bars.map((height, index) => (
        <div
          key={index}
          className="min-w-0 flex-1 rounded-sm bg-forest/70"
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      ))}
    </div>
  );
}
