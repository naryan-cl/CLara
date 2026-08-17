"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import confetti from "canvas-confetti";
import { receiveTextContent } from "@/app/(app)/sessions/actions";
import {
  discardListensStaging,
  finalizeListensUpload,
  prepareListensRecording,
} from "@/app/(app)/sessions/listens-actions";
import { FlowerMark } from "@/components/FlowerMark";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { MAX_LISTENS_STAGING_BYTES } from "@/lib/openai/transcribe";
import {
  listensExtensionFromFileName,
  listensFileExtension,
  mimeTypeForStagingExtension,
  type ListensStagingExtension,
} from "@/lib/listens/audio-format";
import { LISTENS_MAX_SOURCE_BYTES } from "@/lib/listens/constants";
import { requestScreenWakeLock } from "@/lib/listens/screen-wake-lock";
import { transcodeAudioFileForWhisper } from "@/lib/listens/transcode-file";
import { uploadListensStagingBlob } from "@/lib/listens/upload-staging-blob";

const THANKS_NAV_MS = 2400;

const TYPE_OPTIONS = [
  "Note",
  "Reflection",
  "Transcript",
  "Summary",
  "Concept",
  "Framework",
  "Theme",
] as const;

type InputMode = "file" | "paste";

const ALLOWED_EXTENSIONS = [
  ".md",
  ".txt",
  ".pdf",
  ".docx",
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".webm",
  ".ogg",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".flac",
];
const CONVERTIBLE_EXTENSIONS = [".pdf", ".docx"];
const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".webm",
  ".ogg",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".flac",
];

function isAllowedFile(file: File) {
  const name = file.name.toLowerCase();
  if (ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return file.type.startsWith("audio/");
}

function isConvertibleFile(file: File) {
  const name = file.name.toLowerCase();
  return CONVERTIBLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isAudioFile(file: File) {
  const name = file.name.toLowerCase();
  if (AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  return file.type.startsWith("audio/");
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatClock(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function titleFromFileName(name: string) {
  return (
    name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() ||
    `Audio — ${new Date().toLocaleString()}`
  );
}

export function ReceiveUploadForm({
  sessionIds = [],
  relatedDocumentIds = [],
  relatedSessionIds = [],
}: {
  sessionIds?: string[];
  relatedDocumentIds?: string[];
  relatedSessionIds?: string[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [audioBusy, setAudioBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [markdownText, setMarkdownText] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showThanks, setShowThanks] = useState(false);
  const [isExternal, setIsExternal] = useState(false);

  const busy = pending || audioBusy;
  const audioSelected = Boolean(file && isAudioFile(file));

  const clearFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const selectFile = useCallback(
    (next: File | null) => {
      setError(null);
      setMessage(null);
      if (!next) {
        clearFile();
        return;
      }
      if (!isAllowedFile(next)) {
        setError(
          "Only .md, .txt, .pdf, .docx, and audio files are supported.",
        );
        clearFile();
        return;
      }
      if (isAudioFile(next) && next.size > LISTENS_MAX_SOURCE_BYTES) {
        setError(
          "That audio file is too large for the browser (max 512MB). Export a compressed M4A/MP3.",
        );
        clearFile();
        return;
      }
      setMode("file");
      setMarkdownText("");
      setEditorKey((k) => k + 1);
      setFile(next);
    },
    [clearFile],
  );

  function celebrateAndGo(documentId: string) {
    setShowThanks(true);
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.65 },
        colors: ["#7A9B76", "#C4A574", "#D4B896", "#F5F0E8", "#4a6741"],
      });
    }
    window.setTimeout(() => {
      router.push(`/dashboard?select=document:${documentId}&fresh=1`);
      router.refresh();
    }, THANKS_NAV_MS);
  }

  async function submitAudio(fileToSend: File, title: string) {
    setAudioBusy(true);
    setProgress("Preparing…");
    const wakeLock = await requestScreenWakeLock();
    let recordingId: string | null = null;
    let uploadedCount = 0;
    let fileExtension: ListensStagingExtension = "webm";

    try {
      const prepared = await prepareListensRecording();
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      recordingId = prepared.recordingId;

      const namedExt = listensExtensionFromFileName(fileToSend.name);
      const needsCompress =
        fileToSend.size > MAX_LISTENS_STAGING_BYTES || !namedExt;

      let blobs: Blob[];
      let mimeType: string;

      if (needsCompress) {
        setProgress("Compressing for Whisper… keep this page open");
        const transcoded = await transcodeAudioFileForWhisper(
          fileToSend,
          ({ currentSeconds, durationSeconds }) => {
            setProgress(
              `Compressing for Whisper… ${formatClock(currentSeconds)} / ${formatClock(durationSeconds)}`,
            );
          },
        );
        if (!transcoded.ok) {
          setError(transcoded.error);
          return;
        }
        blobs = transcoded.segments;
        mimeType = transcoded.mimeType;
        fileExtension = listensFileExtension(mimeType);
      } else {
        blobs = [fileToSend];
        fileExtension = namedExt;
        mimeType = fileToSend.type || mimeTypeForStagingExtension(namedExt);
      }

      for (let i = 0; i < blobs.length; i++) {
        setProgress(
          blobs.length === 1
            ? `Uploading ${formatFileSize(blobs[i]!.size)}…`
            : `Uploading part ${i + 1} of ${blobs.length}…`,
        );
        const uploaded = await uploadListensStagingBlob({
          streamId: prepared.streamId,
          recordingId: prepared.recordingId,
          index: i,
          blob: blobs[i]!,
          mimeType,
          fileExtension,
        });
        if (!uploaded.ok) {
          setError(uploaded.error);
          if (uploadedCount > 0) {
            await discardListensStaging({
              recordingId: prepared.recordingId,
              segmentCount: uploadedCount,
              fileExtension,
            });
          }
          return;
        }
        uploadedCount = i + 1;
      }

      setProgress("Starting transcription…");
      const result = await finalizeListensUpload({
        recordingId: prepared.recordingId,
        segmentCount: blobs.length,
        mimeType,
        fileExtension,
        title: title || titleFromFileName(fileToSend.name),
        sessionIds,
        relatedDocumentIds,
        relatedSessionIds,
        isExternal,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      clearFile();
      celebrateAndGo(result.documentId);
    } catch (err) {
      console.error("submitAudio failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not upload this audio. Try again.",
      );
      if (recordingId && uploadedCount > 0) {
        await discardListensStaging({
          recordingId,
          segmentCount: uploadedCount,
          fileExtension,
        });
      }
    } finally {
      setAudioBusy(false);
      setProgress(null);
      if (wakeLock && !wakeLock.released) {
        try {
          await wakeLock.release();
        } catch {
          // ignore
        }
      }
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (mode === "file" && !file) {
      setError("Drop or choose a file, or switch to Add text.");
      return;
    }
    if (mode === "paste" && !markdownText.trim()) {
      setError("Add some text, or switch to Upload.");
      return;
    }

    const form = event.currentTarget;
    const title = String(
      new FormData(form).get("title") ?? "",
    ).trim();

    if (mode === "file" && file && isAudioFile(file)) {
      void submitAudio(file, title);
      return;
    }

    const formData = new FormData(form);
    formData.set("source", mode);
    formData.set("isExternal", isExternal ? "true" : "false");
    if (sessionIds.length > 0) {
      formData.set("sessionIds", sessionIds.join(","));
    }
    if (relatedDocumentIds.length > 0) {
      formData.set("relatedDocumentIds", relatedDocumentIds.join(","));
    }
    if (relatedSessionIds.length > 0) {
      formData.set("relatedSessionIds", relatedSessionIds.join(","));
    }
    const convertible = mode === "file" && file ? isConvertibleFile(file) : false;
    if (mode === "file" && file) {
      formData.set("file", file);
      formData.set("pastedText", "");
    } else {
      formData.delete("file");
      formData.set("pastedText", markdownText);
    }

    startTransition(async () => {
      const result = await receiveTextContent(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(
        convertible
          ? "Received — extracting text in the background, refresh in a moment to see it."
          : result.needsReview
            ? "Received — saved with needs_review (missing metadata)."
            : "Received — saved to the Commons.",
      );
      clearFile();
      setMarkdownText("");
      setEditorKey((k) => k + 1);
      setMode("file");
      setIsExternal(false);
      form.reset();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-cloud bg-paper p-6 shadow-soft"
    >
      <div>
        <h2 className="font-display text-lg font-medium text-ink">
          CLara Receives
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          Upload a <span className="font-mono">.md</span>,{" "}
          <span className="font-mono">.txt</span>,{" "}
          <span className="font-mono">.pdf</span>,{" "}
          <span className="font-mono">.docx</span>, or audio (
          <span className="font-mono">.m4a</span>,{" "}
          <span className="font-mono">.mp3</span>,{" "}
          <span className="font-mono">.wav</span>, …), or add formatted text —
          one or the other, not both. Audio uses the same Whisper path as
          Record (up to ~3 hours). Files over 25MB are compressed in this
          browser first — keep the page open.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("file");
            setMarkdownText("");
            setEditorKey((k) => k + 1);
            setError(null);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "file"
              ? "bg-forest text-paper"
              : "border border-cloud text-ink/70 hover:border-sage"
          }`}
        >
          Upload
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("paste");
            clearFile();
            setError(null);
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "paste"
              ? "bg-forest text-paper"
              : "border border-cloud text-ink/70 hover:border-sage"
          }`}
        >
          Add text
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) selectFile(dropped);
          }}
          className={`relative flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors ${
            dragOver
              ? "border-glow bg-glow/10"
              : "border-cloud bg-sand/60 hover:border-sage"
          }`}
        >
          <label className="flex min-h-[8rem] w-full cursor-pointer flex-col items-center justify-center gap-2">
            <p className="text-sm font-medium text-ink">
              {file ? file.name : "Tap to choose a file"}
            </p>
            <p className="text-xs text-ink/50">
              {file
                ? `${formatFileSize(file.size)} · tap to replace`
                : ".md, .txt, .pdf, .docx, or audio · or drop a file here"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".md,.txt,.pdf,.docx,.mp3,.m4a,.aac,.wav,.webm,.ogg,.mp4,.mpeg,.mpga,.oga,.flac,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*"
              className="sr-only"
              onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file ? (
            <button
              type="button"
              onClick={() => clearFile()}
              className="min-h-11 text-sm text-ink/50 hover:text-ink"
            >
              Clear file
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Text</span>
          <MarkdownEditor
            key={editorKey}
            initialMarkdown=""
            placeholder="Write or paste a note — formatting is stored as Markdown…"
            onChangeMarkdown={setMarkdownText}
            minHeightClassName="min-h-[200px]"
          />
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-ink">Title (optional)</span>
        <input
          type="text"
          name="title"
          placeholder={
            mode === "file"
              ? "Defaults from the file name"
              : "Defaults to “Pasted note”"
          }
          className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
        />
      </label>

      {audioSelected ? (
        <p className="text-sm text-ink/55">
          Audio is saved as a Transcript. Keep this page in front until upload
          finishes — then CLara transcribes in the background.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Type</span>
          <select
            name="type"
            defaultValue="Note"
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="isExternal"
          checked={isExternal}
          onChange={(e) => setIsExternal(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-cloud accent-forest"
        />
        <span>
          <span className="font-medium text-ink">This is from outside CL</span>
          <span className="mt-0.5 block text-xs leading-5 text-ink/50">
            Check this if the file or text did not come from a CL / Camp CLAI
            gathering (for example a public article or another program).
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
      >
        {audioBusy
          ? progress ?? "Uploading audio…"
          : pending
            ? "Receiving…"
            : audioSelected
              ? "Transcribe into Commons"
              : "Receive into Commons"}
      </button>

      {progress && audioBusy ? (
        <p className="text-sm text-ink/60" aria-live="polite">
          {progress}
        </p>
      ) : null}

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-md px-2 py-1.5 text-sm text-success animate-success-glow motion-reduce:animate-none">
          {message}
        </p>
      ) : null}

      {showThanks ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6 animate-fade-rise motion-reduce:animate-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-thanks-title"
        >
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-lg border border-cloud bg-paper p-8 text-center shadow-soft">
            <FlowerMark className="h-24 w-24" />
            <h2
              id="upload-thanks-title"
              className="font-display text-xl font-medium text-ink"
            >
              Thank you for contributing to our Commons!
            </h2>
            <p className="text-sm text-ink/55">
              Taking you to the dashboard — CLara is transcribing your
              audio…
            </p>
          </div>
        </div>
      ) : null}
    </form>
  );
}
