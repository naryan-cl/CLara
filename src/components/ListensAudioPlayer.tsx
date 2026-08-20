"use client";

import { useEffect, useRef, useState } from "react";
import { getListensAudioPlayback } from "@/app/(app)/sessions/listens-actions";
import { parseListensJobMeta } from "@/lib/listens/job-meta";

/**
 * Play the original mic take while it remains in listens-staging.
 * Long recordings are stored as ~12-minute files (Whisper size cap).
 * One player advances to the next part when the current file ends.
 */
export function ListensAudioPlayer({
  documentId,
  content,
}: {
  documentId: string;
  content: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playNextRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<{ url: string; label: string }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const hasMeta = Boolean(parseListensJobMeta(content));

  useEffect(() => {
    if (!hasMeta) {
      setUrls(null);
      setError(null);
      setIndex(0);
      return;
    }
    let cancelled = false;
    setIndex(0);
    getListensAudioPlayback(documentId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setUrls(null);
        setError(result.error);
        return;
      }
      setError(null);
      setUrls(result.urls);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, content, hasMeta]);

  useEffect(() => {
    if (!playNextRef.current) return;
    playNextRef.current = false;
    const el = audioRef.current;
    if (!el) return;
    const tryPlay = () => {
      el.play().catch(() => {
        // Browser blocked autoplay after a slow load — user can press play.
      });
    };
    if (el.readyState >= 2) {
      tryPlay();
      return;
    }
    el.addEventListener("canplay", tryPlay, { once: true });
    return () => el.removeEventListener("canplay", tryPlay);
  }, [index, urls]);

  if (!hasMeta) return null;

  if (!urls) {
    if (error) return null;
    return (
      <p className="text-sm text-ink/55" aria-live="polite">
        Loading original audio…
      </p>
    );
  }

  const clip = urls[index];
  if (!clip) return null;
  const isMulti = urls.length > 1;
  const nextClip = urls[index + 1];

  function goTo(next: number) {
    if (next < 0 || next >= urls!.length) return;
    playNextRef.current = false;
    setIndex(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] tracking-wide text-ink/45">
        Original audio
        {isMulti ? ` · Part ${index + 1} of ${urls.length}` : ""}
      </p>
      <audio
        ref={audioRef}
        key={clip.url}
        className="w-full"
        controls
        preload="metadata"
        src={clip.url}
        onEnded={() => {
          if (index >= urls.length - 1) return;
          playNextRef.current = true;
          setIndex(index + 1);
        }}
      >
        <a href={clip.url}>Download {clip.label}</a>
      </audio>
      {isMulti ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
            className="font-mono text-[11px] text-ink/55 hover:text-ink disabled:opacity-40"
          >
            Previous part
          </button>
          <button
            type="button"
            disabled={index >= urls.length - 1}
            onClick={() => goTo(index + 1)}
            className="font-mono text-[11px] text-ink/55 hover:text-ink disabled:opacity-40"
          >
            Next part
          </button>
        </div>
      ) : null}
      {nextClip ? (
        <audio className="hidden" preload="auto" src={nextClip.url} aria-hidden />
      ) : null}
    </div>
  );
}
