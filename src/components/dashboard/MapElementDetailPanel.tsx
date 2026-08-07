"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadCommonsDetail,
  type DetailPayload,
} from "@/app/(app)/commons/actions";
import { MarkdownView } from "@/components/MarkdownView";
import type { AskScope } from "@/lib/ask/scope";
import type { CommonsListItem } from "@/lib/commons/types";
import type { CommonsDocument } from "@/lib/documents/types";

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
      {children}
    </span>
  );
}

function ParticipantList({ people }: { people: string[] }) {
  if (people.length === 0) {
    return <p className="text-sm text-ink/45">No participants listed.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((person) => (
        <li
          key={person}
          className="rounded-pill border border-cloud bg-sand/50 px-3 py-1 text-xs text-ink/80"
        >
          {person}
        </li>
      ))}
    </ul>
  );
}

function DocumentBody({ document }: { document: CommonsDocument }) {
  const participants = asStringList(document.participants);
  const tags = asStringList(document.tags);
  const date = formatDate(document.created_at);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill>{document.type ?? "Document"}</MetaPill>
          {document.privacy_status === "private" ? (
            <MetaPill>Private</MetaPill>
          ) : null}
          {document.needs_review ? <MetaPill>Needs review</MetaPill> : null}
        </div>
        <h2 className="font-display text-xl font-medium text-ink">
          {document.title?.trim() || "Untitled"}
        </h2>
        {date ? (
          <p className="font-mono text-[11px] tracking-wide text-ink/45">
            {date}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
          Participants
        </h3>
        <ParticipantList people={participants} />
      </section>

      {tags.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Tags
          </h3>
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-pill border border-horizon/30 px-2.5 py-0.5 font-mono text-[10px] text-horizon"
              >
                #{tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 border-t border-cloud pt-4">
        <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
          {document.type === "Transcript"
            ? "Transcript"
            : document.type === "Summary"
              ? "Summary"
              : "Content"}
        </h3>
        <MarkdownView
          markdown={document.content}
          emptyLabel="No content yet."
        />
      </section>
    </div>
  );
}

function SessionBody({ detail }: { detail: Extract<DetailPayload, { kind: "session" }> }) {
  const date = formatDate(
    detail.session.occurred_at ?? detail.session.created_at,
  );
  const participants = Array.from(
    new Set(
      detail.documents.flatMap((doc) => asStringList(doc.participants)),
    ),
  );
  const featured = detail.documents.filter(
    (doc) => doc.type === "Summary" || doc.type === "Transcript",
  );
  const otherDocs = detail.documents.filter(
    (doc) => doc.type !== "Summary" && doc.type !== "Transcript",
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill>Session</MetaPill>
          {detail.attending ? <MetaPill>Attending</MetaPill> : null}
        </div>
        <h2 className="font-display text-xl font-medium text-ink">
          {detail.session.name}
        </h2>
        {date ? (
          <p className="font-mono text-[11px] tracking-wide text-ink/45">
            {date}
          </p>
        ) : null}
      </header>

      {detail.session.seed_question ? (
        <section className="flex flex-col gap-1 rounded-md border border-horizon/20 bg-sand/40 px-4 py-3">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Inquiry
          </h3>
          <p className="text-sm leading-6 text-ink/80">
            {detail.session.seed_question}
          </p>
        </section>
      ) : null}

      {detail.session.description ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Description
          </h3>
          <p className="text-sm leading-6 text-ink/70">
            {detail.session.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
          Participants
        </h3>
        <ParticipantList people={participants} />
      </section>

      {featured.length > 0 ? (
        <div className="flex flex-col gap-6 border-t border-cloud pt-4">
          {featured.map((doc) => (
            <section key={doc.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <MetaPill>{doc.type}</MetaPill>
                <h3 className="font-display text-base font-medium text-ink">
                  {doc.title?.trim() || doc.type}
                </h3>
              </div>
              <MarkdownView
                markdown={doc.content}
                emptyLabel={`No ${doc.type?.toLowerCase() ?? "content"} yet.`}
              />
            </section>
          ))}
        </div>
      ) : null}

      {otherDocs.length > 0 ? (
        <section className="flex flex-col gap-2 border-t border-cloud pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Other documents
          </h3>
          <ul className="flex flex-col gap-2">
            {otherDocs.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/sessions/documents/${doc.id}`}
                  className="text-sm text-horizon hover:underline"
                >
                  {doc.title?.trim() || "Untitled"}
                </Link>
                <span className="ml-2 font-mono text-[11px] text-ink/40">
                  {doc.type ?? "Document"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.documents.length === 0 ? (
        <p className="text-sm text-ink/50">
          No Commons documents are linked to this session yet.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dashboard map overlay: Commons summary/transcript + metadata, with an
 * Ask CLara entry that hands the question to the Ask panel (scoped).
 */
export function MapElementDetailPanel({
  item,
  onClose,
  onAskAbout,
  className = "",
}: {
  item: CommonsListItem;
  onClose: () => void;
  onAskAbout: (payload: { question: string; scope: AskScope }) => void;
  className?: string;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCommonsDetail(item.kind, item.id).then((result) => {
      if (cancelled) return;
      if (result.error || !result.detail) {
        setError(result.error ?? "Could not load.");
        setLoading(false);
        return;
      }
      setDetail(result.detail);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [item.kind, item.id]);

  function buildScope(): AskScope {
    if (item.kind === "session") {
      return { sessionId: item.id, label: item.title };
    }
    return { documentId: item.id, label: item.title };
  }

  function onSubmitAsk(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question) {
      setAskError("Ask something about this element first.");
      return;
    }
    setAskError(null);
    onAskAbout({ question, scope: buildScope() });
  }

  const openHref =
    item.kind === "session"
      ? `/sessions/archive/${item.id}`
      : `/sessions/documents/${item.id}`;

  return (
    <aside
      className={`flex min-h-0 flex-col rounded-lg border border-cloud bg-paper shadow-soft animate-panel-slide-in motion-reduce:animate-none ${className}`.trim()}
      aria-label={`${item.kind}: ${item.title}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-cloud px-5 py-4">
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
          {item.kind === "session" ? "Session" : item.elementType}
        </p>
        <button
          type="button"
          className="text-xs text-ink/50 hover:text-ink"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {loading ? <p className="text-sm text-ink/50">Loading…</p> : null}
        {error ? (
          <p className="font-mono text-sm text-danger">{error}</p>
        ) : null}
        {detail?.kind === "document" ? (
          <DocumentBody document={detail.document} />
        ) : null}
        {detail?.kind === "session" ? <SessionBody detail={detail} /> : null}
        {!loading && !error && detail ? (
          <p className="mt-6 text-xs text-ink/40">
            Prefer a full page?{" "}
            <Link href={openHref} className="text-horizon hover:underline">
              Open →
            </Link>
          </p>
        ) : null}
      </div>

      <form
        onSubmit={onSubmitAsk}
        className="flex shrink-0 flex-col gap-2 border-t border-horizon/25 bg-sand/30 px-5 py-4"
      >
        <label
          htmlFor="map-ask-about"
          className="font-mono text-[11px] uppercase tracking-wide text-horizon"
        >
          Ask CLara about this
        </label>
        <textarea
          id="map-ask-about"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder={
            item.kind === "session"
              ? "What themes showed up in this session?"
              : "What stands out in this piece?"
          }
          className="rounded-md border border-cloud bg-paper p-3 text-sm text-ink outline-none focus:border-horizon"
        />
        {askError ? <p className="text-sm text-danger">{askError}</p> : null}
        <button
          type="submit"
          className="btn-primary self-start rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
        >
          Ask CLara
        </button>
      </form>
    </aside>
  );
}
