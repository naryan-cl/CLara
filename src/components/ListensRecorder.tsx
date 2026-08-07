"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finalizeListensUpload,
  prepareListensRecording,
  MAX_LISTENS_SEGMENTS,
} from "@/app/(app)/sessions/listens-actions";
import { createClient } from "@/lib/supabase/client";
import { MAX_LISTENS_STAGING_BYTES } from "@/lib/openai/transcribe";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/**
 * Rotate MediaRecorder this often so each uploaded .webm stays well under
 * Whisper's 25MB cap (~12 min at 32kbps ≈ 2.9MB).
 */
const SEGMENT_SECONDS = 12 * 60;
/** Soft warning before the hard auto-stop. */
const WARN_AT_SECONDS = 150 * 60;
/** Hard stop — ~3 hours of 12-min segments fits under MAX_LISTENS_SEGMENTS. */
const AUTO_STOP_SECONDS = 180 * 60;

const BITRATE = 32_000;
const WAVEFORM_BARS = 40;

type StopReason = "rotate" | "submit";

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

async function requestSystemTabAudio(): Promise<
  { ok: true; stream: MediaStream } | { ok: false; error: string }
> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return {
      ok: false,
      error:
        "System audio isn’t supported in this browser. Try Chrome or Edge.",
    };
  }

  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) {
    return {
      ok: false,
      error:
        "Firefox’s share dialog can’t include tab or system audio (you’ll only get a screen picker). Open CLara in Chrome or Edge, then choose Entire screen (or a Chrome tab) and enable Share audio.",
    };
  }
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) {
    return {
      ok: false,
      error:
        "Safari can’t capture system/tab audio for web apps. Open CLara in Chrome or Edge for this option.",
    };
  }

  try {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor",
        frameRate: 1,
        width: 16,
        height: 16,
      },
      audio: true,
      systemAudio: "include",
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      monitorTypeSurfaces: "include",
    } as DisplayMediaStreamOptions);

    for (const track of display.getVideoTracks()) {
      track.stop();
    }

    const audioTracks = display.getAudioTracks();
    if (audioTracks.length === 0) {
      for (const track of display.getTracks()) track.stop();
      return {
        ok: false,
        error:
          "No audio track came back. In Chrome/Edge: pick Entire screen and check “Share system audio”, or pick a Chrome tab playing YouTube/Zoom and check “Share tab audio”. (Window share often has no audio.)",
      };
    }

    return { ok: true, stream: new MediaStream(audioTracks) };
  } catch {
    return {
      ok: false,
      error: "System audio share was cancelled or blocked.",
    };
  }
}

/**
 * Listens v2 Module B: mic (+ system) mix, meters, pause/resume.
 * Every ~12 minutes the MediaRecorder restarts and uploads an independent
 * .webm segment (under Whisper's 25MB/file). Submit finalizes → Inngest
 * Whispers each segment and joins the text.
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
  const [segmentLabel, setSegmentLabel] = useState(1);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(quietBars);
  const [segmentUploading, setSegmentUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const systemAnalyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const mimeTypeRef = useRef("audio/webm");
  const streamIdRef = useRef<string | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const segmentIndexRef = useRef(0);
  const segmentElapsedRef = useRef(0);
  const stopReasonRef = useRef<StopReason | null>(null);
  const rotatingRef = useRef(false);
  const titleRef = useRef(title);
  titleRef.current = title;
  const sessionIdsRef = useRef(sessionIds);
  sessionIdsRef.current = sessionIds;

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
    recordStreamRef.current = null;
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
    streamIdRef.current = null;
    recordingIdRef.current = null;
    segmentIndexRef.current = 0;
    segmentElapsedRef.current = 0;
    stopReasonRef.current = null;
    rotatingRef.current = false;
  }, [disposeGraph, stopAllTracks]);

  useEffect(() => () => teardownCapture(), [teardownCapture]);

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

  const uploadSegment = useCallback(async (blob: Blob, index: number) => {
    const streamId = streamIdRef.current;
    const recordingId = recordingIdRef.current;
    if (!streamId || !recordingId) {
      setError("Recording session was lost. Try again.");
      return false;
    }
    if (blob.size === 0) {
      setError("Empty audio segment. Try again.");
      return false;
    }
    if (blob.size > MAX_LISTENS_STAGING_BYTES) {
      setError(
        `Segment ${index + 1} is too large for Whisper (${Math.round(blob.size / 1024 / 1024)}MB). Try again.`,
      );
      return false;
    }

    setSegmentUploading(true);
    const supabase = createClient();
    const ext = (mimeTypeRef.current || "").includes("mp4") ? "m4a" : "webm";
    const path = `${streamId}/${recordingId}/${index}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("listens-staging")
      .upload(path, blob, {
        contentType: mimeTypeRef.current || "audio/webm",
        upsert: false,
      });
    setSegmentUploading(false);

    if (uploadError) {
      setError(
        uploadError.message.includes("not found") ||
          uploadError.message.includes("Bucket")
          ? "Listens storage isn’t set up yet. Ask an admin to run migration 0014_listens_staging_storage.sql in Supabase."
          : `Segment upload failed: ${uploadError.message}`,
      );
      return false;
    }
    return true;
  }, []);

  const startSegmentRecorder = useCallback(() => {
    const recordStream = recordStreamRef.current;
    const mimeType = mimeTypeRef.current;
    if (!recordStream) {
      setError("Capture stream was lost. Try again.");
      return;
    }
    if (segmentIndexRef.current >= MAX_LISTENS_SEGMENTS) {
      setError("Reached the maximum number of segments for one recording.");
      stopReasonRef.current = "submit";
      mediaRecorderRef.current?.stop();
      return;
    }

    chunksRef.current = [];
    segmentElapsedRef.current = 0;
    setSegmentLabel(segmentIndexRef.current + 1);

    const recorder = new MediaRecorder(recordStream, {
      mimeType,
      audioBitsPerSecond: BITRATE,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const reason = stopReasonRef.current;
      stopReasonRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const index = segmentIndexRef.current;
      chunksRef.current = [];

      void (async () => {
        if (!reason) return;

        const uploaded = await uploadSegment(blob, index);
        if (!uploaded) {
          setIsRecording(false);
          setIsPaused(false);
          teardownCapture();
          return;
        }

        if (reason === "rotate") {
          segmentIndexRef.current = index + 1;
          rotatingRef.current = false;
          startSegmentRecorder();
          return;
        }

        // Submit: finalize with all uploaded segments (0..index inclusive).
        const segmentCount = index + 1;
        startTransition(async () => {
          const result = await finalizeListensUpload({
            recordingId: recordingIdRef.current!,
            segmentCount,
            mimeType: mimeTypeRef.current || "audio/webm",
            fileExtension: (mimeTypeRef.current || "").includes("mp4")
              ? "m4a"
              : "webm",
            title: titleRef.current,
            sessionIds: sessionIdsRef.current,
          });
          teardownCapture();
          if (!result.ok) {
            setError(result.error);
            setIsRecording(false);
            return;
          }
          setTitle("");
          setIsRecording(false);
          router.push(`/sessions/documents/${result.documentId}`);
          router.refresh();
        });
      })();
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
  }, [router, teardownCapture, uploadSegment]);

  const requestStop = useCallback((reason: StopReason) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (reason === "rotate" && rotatingRef.current) return;
    if (reason === "rotate") rotatingRef.current = true;
    stopReasonRef.current = reason;
    if (recorder.state === "paused") {
      recorder.resume();
    }
    recorder.stop();
    if (reason === "submit") {
      setIsPaused(false);
    }
  }, []);

  const stopAndSubmit = useCallback(() => {
    requestStop("submit");
  }, [requestStop]);

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
    if (!isRecording || isPaused || pending) return;

    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= AUTO_STOP_SECONDS) {
          requestStop("submit");
          return next;
        }
        return next;
      });

      segmentElapsedRef.current += 1;
      if (
        segmentElapsedRef.current >= SEGMENT_SECONDS &&
        !rotatingRef.current
      ) {
        requestStop("rotate");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, pending, requestStop]);

  async function startRecording() {
    setError(null);

    const mimeType = pickMimeType();
    if (!mimeType) {
      setError("Recording isn't supported in this browser yet.");
      return;
    }

    const prepared = await prepareListensRecording();
    if (!prepared.ok) {
      setError(prepared.error);
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
    mimeTypeRef.current = mimeType;
    streamIdRef.current = prepared.streamId;
    recordingIdRef.current = prepared.recordingId;
    segmentIndexRef.current = 0;
    segmentElapsedRef.current = 0;

    const recordStream = buildCaptureGraph(micStream, systemStream);
    recordStreamRef.current = recordStream;

    setSystemAudioActive(Boolean(systemStream));
    setElapsedSeconds(0);
    setIsPaused(false);
    setIsRecording(true);
    startSegmentRecorder();
  }

  const busy = pending;
  const showViz = isRecording || busy || segmentUploading;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          CLara Listens
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Record mic + optional system audio for meetings up to ~3 hours.
          Audio uploads in ~12-minute chunks to private staging; Whisper
          transcribes each chunk in the background. Use Chrome or Edge for
          system audio.
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
          <span className="font-medium text-ink">Include system audio</span>
          <span className="mt-0.5 block text-ink/55">
            On by default. Browsers always show a screen/window picker — we
            discard the video and keep sound. In <strong>Chrome or Edge</strong>
            , choose <em>Entire screen</em> + <em>Share system audio</em>, or a{" "}
            <em>Chrome tab</em> with <em>Share tab audio</em>.
          </span>
        </span>
      </label>

      {showViz ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-cloud bg-sand/40 px-4 py-3"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink/70">
              <span
                className={`h-2 w-2 rounded-pill ${
                  isPaused
                    ? "bg-ink/35"
                    : "animate-pulse bg-danger motion-reduce:animate-none"
                }`}
              />
              <span className="font-mono">{formatElapsed(elapsedSeconds)}</span>
              <span className="text-ink/45">
                {busy
                  ? "Finalizing…"
                  : segmentUploading
                    ? "Saving chunk…"
                    : isPaused
                      ? "Paused"
                      : "Recording"}
              </span>
              <span className="font-mono text-[11px] text-ink/40">
                chunk {segmentLabel}
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
              disabled={segmentUploading}
              className="rounded-md border border-forest px-4 py-2 text-sm font-medium text-forest hover:bg-forest/5 disabled:opacity-60"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={stopAndSubmit}
              disabled={segmentUploading}
              className="btn-primary rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
            >
              Submit
            </button>
          </>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <span className="h-2 w-2 animate-pulse rounded-pill bg-glow shadow-glow motion-reduce:animate-none" />
            <span>Starting transcription…</span>
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
  const fill = tone === "horizon" ? "bg-horizon" : "bg-forest";
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
