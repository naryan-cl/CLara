"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadCommonsDetail,
  type DetailPayload,
} from "@/app/(app)/commons/actions";
import { DocumentEditor } from "@/components/DocumentEditor";
import { MarkdownView } from "@/components/MarkdownView";
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

function DocumentBody({
  document,
  hideTitle = false,
}: {
  document: CommonsDocument;
  hideTitle?: boolean;
}) {
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
        {!hideTitle ? (
          <h2 className="font-display text-xl font-medium text-ink">
            {document.title?.trim() || "Untitled"}
          </h2>
        ) : null}
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

function SessionBody({
  detail,
  hideTitle = false,
}: {
  detail: Extract<DetailPayload, { kind: "session" }>;
  hideTitle?: boolean;
}) {
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
        {!hideTitle ? (
          <h2 className="font-display text-xl font-medium text-ink">
            {detail.session.name}
          </h2>
        ) : null}
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
 * Shared Commons element body for the dashboard Ask host (map + list select).
 * Loads detail once; parent owns chrome (title, edit, close) and Ask footer.
 */
export function ElementDetailBody({
  item,
  editing = false,
  onEditingChange,
  onCanEditChange,
  onDetailKindChange,
  onDeleted,
}: {
  item: CommonsListItem;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onCanEditChange?: (canEdit: boolean) => void;
  onDetailKindChange?: (kind: "document" | "session" | null) => void;
  /** After document delete — parent clears selection. */
  onDeleted?: () => void;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    onCanEditChange?.(false);
    onDetailKindChange?.(null);
    loadCommonsDetail(item.kind, item.id).then((result) => {
      if (cancelled) return;
      if (result.error || !result.detail) {
        setError(result.error ?? "Could not load.");
        setLoading(false);
        onCanEditChange?.(false);
        onDetailKindChange?.(null);
        return;
      }
      setDetail(result.detail);
      setLoading(false);
      onCanEditChange?.(
        result.detail.kind === "document" ? result.detail.canEdit : false,
      );
      onDetailKindChange?.(result.detail.kind);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit callbacks — parent setters are stable enough; avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, item.id]);

  const openHref =
    item.kind === "session"
      ? `/sessions/archive/${item.id}`
      : `/sessions/documents/${item.id}`;

  if (loading) {
    return <p className="text-sm text-ink/50">Loading…</p>;
  }
  if (error) {
    return <p className="font-mono text-sm text-danger">{error}</p>;
  }
  if (!detail) return null;

  if (editing && detail.kind === "document") {
    return (
      <DocumentEditor
        key={`edit-${detail.document.id}-${detail.document.updated_at}`}
        document={detail.document}
        sessions={detail.sessions}
        canEdit={detail.canEdit}
        compact
        hideEditButton
        forceEditing
        onCancelEditing={() => onEditingChange?.(false)}
        onDeleted={() => {
          onEditingChange?.(false);
          onDeleted?.();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {detail.kind === "document" ? (
        <DocumentBody document={detail.document} hideTitle />
      ) : (
        <SessionBody detail={detail} hideTitle />
      )}
      <p className="text-xs text-ink/40">
        Prefer a full page?{" "}
        <Link href={openHref} className="text-horizon hover:underline">
          Open →
        </Link>
      </p>
    </div>
  );
}
