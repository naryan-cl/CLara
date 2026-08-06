"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { receiveTextContent } from "@/app/(app)/sessions/actions";
import { MarkdownEditor } from "@/components/MarkdownEditor";

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
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isConvertibleFile(file: File) {
  const name = file.name.toLowerCase();
  return CONVERTIBLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isAudioFile(file: File) {
  const name = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function ReceiveUploadForm({
  sessionIds = [],
}: {
  sessionIds?: string[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<InputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [markdownText, setMarkdownText] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

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
          "Only .md, .txt, .pdf, .docx, and short audio files are supported.",
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
    const formData = new FormData(form);
    formData.set("source", mode);
    if (sessionIds.length > 0) {
      formData.set("sessionIds", sessionIds.join(","));
    }
    const convertible = mode === "file" && file ? isConvertibleFile(file) : false;
    const audio = mode === "file" && file ? isAudioFile(file) : false;
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
          : audio
            ? "Received — transcribed with Whisper and saved as a Transcript."
            : result.needsReview
              ? "Received — saved with needs_review (missing metadata)."
              : "Received — saved to the Commons.",
      );
      clearFile();
      setMarkdownText("");
      setEditorKey((k) => k + 1);
      setMode("file");
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
          <span className="font-mono">.docx</span>, or a short audio clip
          (<span className="font-mono">.mp3</span>,{" "}
          <span className="font-mono">.m4a</span>,{" "}
          <span className="font-mono">.wav</span>, …), or add formatted text —
          one or the other, not both. Text is stored as Markdown; audio is
          transcribed with Whisper into a Transcript (same ~15 min / ~4MB cap
          as Record).
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
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors ${
            dragOver
              ? "border-glow bg-glow/10"
              : "border-cloud bg-sand/60 hover:border-sage"
          }`}
        >
          <p className="text-sm font-medium text-ink">
            {file ? file.name : "Drop a file here"}
          </p>
          <p className="text-xs text-ink/50">
            {file
              ? `${Math.max(1, Math.round(file.size / 1024))} KB · click to replace`
              : ".md, .txt, .pdf, .docx, or short audio · or click to browse"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".md,.txt,.pdf,.docx,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mpeg,.mpga,.oga,.flac,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*"
            className="absolute h-0 w-0 opacity-0"
            onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 text-sm font-medium text-horizon underline-offset-2 hover:underline"
          >
            {file ? "Choose a different file" : "Browse files"}
          </button>
          {file ? (
            <button
              type="button"
              onClick={() => clearFile()}
              className="text-xs text-ink/50 hover:text-ink"
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

      <button
        type="submit"
        disabled={pending}
        className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
      >
        {pending ? "Receiving…" : "Receive into Commons"}
      </button>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-md px-2 py-1.5 text-sm text-success animate-success-glow motion-reduce:animate-none">
          {message}
        </p>
      ) : null}
    </form>
  );
}
