"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  discardListensStaging,
  finalizeListensUpload,
  prepareListensRecording,
} from "@/app/(app)/sessions/listens-actions";
import { createClient } from "@/lib/supabase/client";
import { MAX_LISTENS_STAGING_BYTES } from "@/lib/openai/transcribe";
import { MAX_LISTENS_SEGMENTS } from "@/lib/listens/constants";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** Rotate MediaRecorder so each .webm stays under Whisper's 25MB cap. */
const SEGMENT_SECONDS = 12 * 60;
const WARN_AT_SECONDS = 150 * 60;
const AUTO_STOP_SECONDS = 180 * 60;
const BITRATE = 32_000;
const WAVEFORM_BARS = 40;

type StopReason = "rotate" | "submit" | "stop" | "discard";

export type CapturePhase =
  | "idle"
  | "recording"
  | "paused"
  | "stopped"
  | "finalizing";

export type ListensRecorderHandle = {
  /** Phase the capture strip is in. */
  getPhase: () => CapturePhase;
  /** True when staged audio exists (recording, paused, or stopped). */
  hasAudio: () => boolean;
  /** Stop capture, upload last segment, keep staging — ready for Submit. */
  stopSaving: () => void;
  /** Stop capture and finalize to Commons (navigate away). */
  stopAndSubmit: () => void;
  /** Finalize an already-stopped recording. */
  submitStopped: () => Promise<void>;
};

type ListensRecorderProps = {
  /** Transcript + session title from Session details (single Title field). */
  documentTitle?: string;
  resolveSessionIds?: () => Promise<
    { ok: true; sessionIds: string[] } | { ok: false; error: string }
  >;
  onPhaseChange?: (phase: CapturePhase) => void;
};

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
        "Firefox’s share dialog can’t include tab or system audio. Open CLara in Chrome or Edge.",
    };
  }
  if (/safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua)) {
    return {
      ok: false,
      error:
        "Safari can’t capture system/tab audio for web apps. Open CLara in Chrome or Edge.",
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
          "No audio track came back. Select a tab/window and enable “Also share system audio”.",
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
 * Capture strip for Listens v2: record / pause / stop / trash + meters.
 * Submit lives under Session details (parent calls the imperative handle).
 */
export const ListensRecorder = forwardRef<
  ListensRecorderHandle,
  ListensRecorderProps
>(function ListensRecorder(
  { documentTitle = "", resolveSessionIds, onPhaseChange },
  ref,
) {
  const router = useRouter();
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [segmentLabel, setSegmentLabel] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [systemLevel, setSystemLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(quietBars);
  const [segmentUploading, setSegmentUploading] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);

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
  /** How many segments are already in Storage (0..n). */
  const uploadedCountRef = useRef(0);
  const segmentElapsedRef = useRef(0);
  const stopReasonRef = useRef<StopReason | null>(null);
  const rotatingRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;
  const resolveSessionIdsRef = useRef(resolveSessionIds);
  resolveSessionIdsRef.current = resolveSessionIds;
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const updatePhase = useCallback((next: CapturePhase) => {
    phaseRef.current = next;
    setPhase(next);
    onPhaseChangeRef.current?.(next);
  }, []);

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

  /** Tear down live capture but keep staging ids when stopping to save. */
  const teardownLiveCapture = useCallback(() => {
    disposeGraph();
    stopAllTracks();
    mediaRecorderRef.current = null;
    stopReasonRef.current = null;
    rotatingRef.current = false;
  }, [disposeGraph, stopAllTracks]);

  const resetAll = useCallback(() => {
    teardownLiveCapture();
    streamIdRef.current = null;
    recordingIdRef.current = null;
    segmentIndexRef.current = 0;
    uploadedCountRef.current = 0;
    segmentElapsedRef.current = 0;
    setElapsedSeconds(0);
    setSegmentLabel(1);
    updatePhase("idle");
  }, [teardownLiveCapture, updatePhase]);

  useEffect(() => () => teardownLiveCapture(), [teardownLiveCapture]);

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
          ? "Listens storage isn’t set up yet. Ask an admin to run migration 0014."
          : `Segment upload failed: ${uploadError.message}`,
      );
      return false;
    }
    uploadedCountRef.current = index + 1;
    return true;
  }, []);

  const runFinalize = useCallback(async () => {
    const recordingId = recordingIdRef.current;
    const segmentCount = uploadedCountRef.current;
    const mimeTypeForUpload = mimeTypeRef.current || "audio/webm";
    const fileExtension = mimeTypeForUpload.includes("mp4") ? "m4a" : "webm";
    const titleForUpload = documentTitleRef.current.trim();

    if (!recordingId || segmentCount < 1) {
      setError("Nothing to submit yet — record something first.");
      updatePhase(uploadedCountRef.current > 0 ? "stopped" : "idle");
      return;
    }

    updatePhase("finalizing");
    try {
      let sessionsForFinalize: string[] = [];
      const resolve = resolveSessionIdsRef.current;
      if (resolve) {
        const resolved = await resolve();
        if (!resolved.ok) {
          setError(resolved.error);
          updatePhase("stopped");
          return;
        }
        sessionsForFinalize = resolved.sessionIds;
      }

      const result = await finalizeListensUpload({
        recordingId,
        segmentCount,
        mimeType: mimeTypeForUpload,
        fileExtension,
        title: titleForUpload || undefined,
        sessionIds: sessionsForFinalize,
      });

      if (!result.ok) {
        setError(result.error);
        updatePhase("stopped");
        return;
      }

      resetAll();
      router.replace(`/sessions/documents/${result.documentId}`);
      router.refresh();
    } catch (err) {
      console.error("finalizeListensUpload client error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not finish saving the recording. Try again.",
      );
      updatePhase("stopped");
    }
  }, [resetAll, router, updatePhase]);

  const startSegmentRecorder = useCallback(() => {
    const recordStream = recordStreamRef.current;
    const mimeType = mimeTypeRef.current;
    if (!recordStream) {
      setError("Capture stream was lost. Try again.");
      return;
    }
    if (segmentIndexRef.current >= MAX_LISTENS_SEGMENTS) {
      setError("Reached the maximum number of segments for one recording.");
      stopReasonRef.current = "stop";
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

        if (reason === "discard") {
          const uploaded = uploadedCountRef.current;
          const recordingId = recordingIdRef.current;
          const mimeTypeForUpload = mimeTypeRef.current || "audio/webm";
          const fileExtension = mimeTypeForUpload.includes("mp4")
            ? "m4a"
            : "webm";
          if (recordingId && uploaded > 0) {
            await discardListensStaging({
              recordingId,
              segmentCount: uploaded,
              fileExtension,
            });
          }
          resetAll();
          setError(null);
          return;
        }

        const uploaded = await uploadSegment(blob, index);
        if (!uploaded) {
          teardownLiveCapture();
          updatePhase(
            uploadedCountRef.current > 0 ? "stopped" : "idle",
          );
          return;
        }

        if (reason === "rotate") {
          segmentIndexRef.current = index + 1;
          rotatingRef.current = false;
          startSegmentRecorder();
          return;
        }

        if (reason === "stop") {
          teardownLiveCapture();
          updatePhase("stopped");
          return;
        }

        // submit
        await runFinalize();
      })();
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
  }, [resetAll, runFinalize, teardownLiveCapture, updatePhase, uploadSegment]);

  const requestStop = useCallback((reason: StopReason) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      if (reason === "submit" && uploadedCountRef.current > 0) {
        void runFinalize();
      }
      return;
    }
    if (reason === "rotate" && rotatingRef.current) return;
    if (reason === "rotate") rotatingRef.current = true;
    stopReasonRef.current = reason;
    if (recorder.state === "paused") {
      recorder.resume();
    }
    recorder.stop();
  }, [runFinalize]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (typeof recorder.pause !== "function") {
      setError("Pause isn’t supported in this browser. You can still Stop.");
      return;
    }
    recorder.pause();
    updatePhase("paused");
    stopMeterLoop();
    setMicLevel(0);
    setSystemLevel(0);
    setBars(quietBars());
  }, [stopMeterLoop, updatePhase]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    updatePhase("recording");
    void audioContextRef.current?.resume().catch(() => {});
    runMeterLoop();
  }, [runMeterLoop, updatePhase]);

  useEffect(() => {
    if (phase !== "recording") return;

    const interval = setInterval(() => {
      setElapsedSeconds((seconds) => {
        const next = seconds + 1;
        if (next >= AUTO_STOP_SECONDS) {
          // Cap reached — save like Stop (don't auto-navigate).
          requestStop("stop");
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
  }, [phase, requestStop]);

  async function startRecording() {
    setError(null);

    if (phase === "stopped" && uploadedCountRef.current > 0) {
      setError("Trash the saved take first, or Submit it below.");
      return;
    }

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

    // If the mic dies mid-take, treat it like Stop — keep what we have.
    micStream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (
          phaseRef.current === "recording" ||
          phaseRef.current === "paused"
        ) {
          requestStop("stop");
        }
      });
    });

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
    uploadedCountRef.current = 0;
    segmentElapsedRef.current = 0;

    const recordStream = buildCaptureGraph(micStream, systemStream);
    recordStreamRef.current = recordStream;

    setSystemAudioActive(Boolean(systemStream));
    setElapsedSeconds(0);
    updatePhase("recording");
    startSegmentRecorder();
  }

  async function confirmTrash() {
    setTrashConfirmOpen(false);
    setError(null);

    if (phase === "recording" || phase === "paused") {
      requestStop("discard");
      return;
    }

    if (phase === "stopped") {
      const recordingId = recordingIdRef.current;
      const uploaded = uploadedCountRef.current;
      const mimeTypeForUpload = mimeTypeRef.current || "audio/webm";
      const fileExtension = mimeTypeForUpload.includes("mp4") ? "m4a" : "webm";
      if (recordingId && uploaded > 0) {
        const result = await discardListensStaging({
          recordingId,
          segmentCount: uploaded,
          fileExtension,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      resetAll();
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      getPhase: () => phaseRef.current,
      hasAudio: () =>
        uploadedCountRef.current > 0 ||
        phaseRef.current === "recording" ||
        phaseRef.current === "paused",
      stopSaving: () => requestStop("stop"),
      stopAndSubmit: () => requestStop("submit"),
      submitStopped: () => runFinalize(),
    }),
    [requestStop, runFinalize],
  );

  const isLive = phase === "recording" || phase === "paused";
  const busy = phase === "finalizing";
  const showViz = isLive || busy || segmentUploading || phase === "stopped";
  const canTrash =
    isLive || phase === "stopped" || uploadedCountRef.current > 0;

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-cloud bg-paper p-6 shadow-soft">
      {/* Transport controls */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-4 sm:gap-5">
          <RecordButton
            active={phase === "recording"}
            paused={phase === "paused"}
            disabled={busy || segmentUploading || phase === "stopped"}
            onClick={() => {
              if (phase === "idle") void startRecording();
            }}
          />
          <IconButton
            label={phase === "paused" ? "Resume" : "Pause"}
            disabled={!isLive || segmentUploading || busy}
            onClick={phase === "paused" ? resumeRecording : pauseRecording}
          >
            {phase === "paused" ? <IconPlay /> : <IconPause />}
          </IconButton>
          <IconButton
            label="Stop"
            disabled={!isLive || segmentUploading || busy}
            onClick={() => requestStop("stop")}
          >
            <IconStop />
          </IconButton>
          <IconButton
            label="Trash recording"
            disabled={!canTrash || busy || segmentUploading}
            danger
            onClick={() => setTrashConfirmOpen(true)}
          >
            <IconTrash />
          </IconButton>
        </div>

        {showViz ? (
          <div
            className="w-full max-w-lg flex flex-col gap-3 rounded-md border border-cloud bg-sand/40 px-4 py-3"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink/70">
                <span
                  className={`h-2 w-2 rounded-pill ${
                    phase === "paused" || phase === "stopped"
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
                      : phase === "paused"
                        ? "Paused"
                        : phase === "stopped"
                          ? "Saved — ready to submit"
                          : "Recording"}
                </span>
                {isLive || phase === "stopped" ? (
                  <span className="font-mono text-[11px] text-ink/40">
                    chunk {segmentLabel}
                  </span>
                ) : null}
              </div>
              {isLive ? (
                <div className="flex flex-col gap-1.5 sm:items-end">
                  <VolumeMeter
                    label="Mic"
                    level={phase === "paused" ? 0 : micLevel}
                  />
                  {systemAudioActive ? (
                    <VolumeMeter
                      label="System"
                      level={phase === "paused" ? 0 : systemLevel}
                      tone="horizon"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <WaveformBars
              bars={
                phase === "paused" || phase === "stopped" || busy
                  ? quietBars()
                  : bars
              }
            />

            {elapsedSeconds >= WARN_AT_SECONDS && isLive ? (
              <p className="text-sm text-warning">
                Nearing the {Math.round(AUTO_STOP_SECONDS / 60)}-min cap — wrap
                up soon
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-center text-sm text-ink/50">
            Tap the mic to start capturing
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-ink/80">
        <input
          type="checkbox"
          className="mt-1"
          checked={includeSystemAudio}
          disabled={isLive || busy || phase === "stopped"}
          onChange={(event) => setIncludeSystemAudio(event.target.checked)}
        />
        <span>
          <span className="font-medium text-ink">Include system audio</span>
          <span className="mt-0.5 block text-ink/55">
            Only works with Chrome or Edge — select a tab/window and select
            &ldquo;Also share system audio&rdquo;.
          </span>
        </span>
      </label>

      {busy ? (
        <div className="flex items-center justify-center gap-2 text-sm text-ink/70">
          <span className="h-2 w-2 animate-pulse rounded-pill bg-glow shadow-glow motion-reduce:animate-none" />
          <span>Starting transcription…</span>
        </div>
      ) : null}

      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}

      {trashConfirmOpen ? (
        <ConfirmDialog
          title="Delete this recording?"
          body="This removes the audio you’ve captured. You stay on Record and can start again."
          confirmLabel="Delete recording"
          danger
          onCancel={() => setTrashConfirmOpen(false)}
          onConfirm={() => void confirmTrash()}
        />
      ) : null}
    </div>
  );
});

function RecordButton({
  active,
  paused,
  disabled,
  onClick,
}: {
  active: boolean;
  paused: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={active || paused ? "Recording" : "Start recording"}
      className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-200 ease-[var(--ease)] disabled:opacity-40 ${
        active
          ? "bg-danger text-paper shadow-glow scale-105"
          : paused
            ? "bg-ink/25 text-paper"
            : "bg-forest text-paper hover:scale-105 hover:shadow-soft"
      }`}
    >
      {active ? (
        <span className="absolute inset-0 animate-glow-pulse rounded-full bg-danger/30 motion-reduce:animate-none" />
      ) : null}
      <IconMic className="relative h-7 w-7" />
    </button>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors disabled:opacity-35 ${
        danger
          ? "border-cloud text-ink/55 hover:border-danger hover:text-danger"
          : "border-cloud text-ink/70 hover:border-forest hover:text-forest"
      }`}
    >
      {children}
    </button>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger,
  onCancel,
  onConfirm,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-cloud bg-paper p-5 shadow-soft">
        <h2
          id="confirm-dialog-title"
          className="font-display text-lg font-medium text-ink"
        >
          {title}
        </h2>
        <p className="text-sm text-ink/65">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-cloud px-4 py-2 text-sm text-ink"
          >
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-md border border-forest px-4 py-2 text-sm font-medium text-forest hover:bg-forest/5"
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium text-paper ${
              danger ? "bg-danger" : "btn-primary bg-forest"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
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
