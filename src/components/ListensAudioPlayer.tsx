"use client";

import { useEffect, useState } from "react";
import { getListensAudioPlayback } from "@/app/(app)/sessions/listens-actions";
import { parseListensJobMeta } from "@/lib/listens/job-meta";

/**
 * Play the original mic take while it remains in listens-staging.
 */
export function ListensAudioPlayer({
  documentId,
  content,
}: {
  documentId: string;
  content: string;
}) {
  const [urls, setUrls] = useState<{ url: string; label: string }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const hasMeta = Boolean(parseListensJobMeta(content));

  useEffect(() => {
    if (!hasMeta) {
      setUrls(null);
      setError(null);
      return;
    }
    let cancelled = false;
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

  if (!hasMeta) return null;

  if (!urls) {
    if (error) return null;
    return (
      <p className="text-sm text-ink/55" aria-live="polite">
        Loading original audio…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] tracking-wide text-ink/45">
        Original audio
      </p>
      {urls.map((clip) => (
        <div key={clip.url} className="flex flex-col gap-1">
          {urls.length > 1 ? (
            <p className="text-xs text-ink/55">{clip.label}</p>
          ) : null}
          <audio className="w-full" controls preload="metadata" src={clip.url}>
            <a href={clip.url}>Download {clip.label}</a>
          </audio>
        </div>
      ))}
    </div>
  );
}
