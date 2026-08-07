"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { backfillMissingEmbeddings } from "@/app/(app)/admin/actions";
import type { MissingEmbeddingDoc } from "@/lib/embeddings/list-missing-embeddings";

/**
 * Admin: show Commons docs with content but zero Ask chunks, and enqueue
 * re-index (clara/document.created → embed job).
 */
export function AskIndexPanel({
  documents,
  listError,
}: {
  documents: MissingEmbeddingDoc[];
  listError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function onBackfill() {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await backfillMissingEmbeddings();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(
        result.queued === 0
          ? "Nothing to queue — every document with content is indexed."
          : `Queued ${result.queued} document${result.queued === 1 ? "" : "s"} for Ask indexing. Keep Inngest running until jobs finish.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-ink/60">
        Ask CLara searches <span className="font-medium text-ink/80">document
        embeddings</span>, not Knowledge Map atoms. If you can read a Summary
        but Ask says it finds nothing, the embed job may never have run.
        Apply migration{" "}
        <span className="font-mono text-[11px]">0019_document_chunk_count</span>
        , ensure Inngest is processing{" "}
        <span className="font-mono text-[11px]">clara-embed-document</span>,
        then re-index here.
      </p>

      {listError ? (
        <p className="font-mono text-sm text-danger">
          {listError.includes("list_documents_missing_embeddings") ||
          listError.includes("schema cache") ||
          listError.includes("does not exist")
            ? "Ask-index helpers unavailable — apply migration 0019_document_chunk_count.sql in Supabase."
            : listError}
        </p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-ink/60">
          All non-draft documents with content have at least one Ask chunk.
        </p>
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
            {documents.length} missing from Ask index
          </p>
          <ul className="flex max-h-48 flex-col gap-2 overflow-auto">
            {documents.map((doc) => (
              <li key={doc.documentId} className="text-sm text-ink">
                <Link
                  href={`/sessions/documents/${doc.documentId}`}
                  className="text-horizon hover:underline"
                >
                  {doc.title?.trim() || "Untitled"}
                </Link>
                {doc.documentType ? (
                  <span className="ml-2 font-mono text-[11px] text-ink/40">
                    {doc.documentType}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {note ? <p className="text-sm text-forest">{note}</p> : null}

      <button
        type="button"
        onClick={onBackfill}
        disabled={pending || Boolean(listError) || documents.length === 0}
        className="btn-primary w-fit bg-forest px-4 py-2 text-sm font-medium text-paper ring-1 ring-glow/30 disabled:opacity-60"
      >
        {pending ? "Queueing…" : "Re-index missing documents"}
      </button>
    </div>
  );
}
