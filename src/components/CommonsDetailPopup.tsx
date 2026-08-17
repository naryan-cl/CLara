"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadCommonsDetail,
  type DetailPayload,
} from "@/app/(app)/commons/actions";
import { AttendanceToggle } from "@/components/AttendanceToggle";
import { CommentThread } from "@/components/CommentThread";
import { SessionSummaryTabs } from "@/components/commons/ElementReadView";
import { DocumentEditor } from "@/components/DocumentEditor";
import { SessionEditor } from "@/components/SessionEditor";
import type { CommonsListItem } from "@/lib/commons/types";

/**
 * Commons detail popup (close via ✕ or backdrop).
 * Parent remounts via key when selection changes so load state resets cleanly.
 */
export function CommonsDetailPopup({
  item,
  currentUserId,
  onClose,
}: {
  item: CommonsListItem;
  currentUserId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 animate-overlay-fade motion-reduce:animate-none"
        aria-label="Close detail"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-t-lg border border-cloud bg-paper shadow-soft animate-fade-rise motion-reduce:animate-none sm:rounded-lg"
      >
        <div className="flex items-center justify-between gap-3 border-b border-cloud px-4 py-3">
          <p className="truncate font-mono text-[11px] uppercase tracking-wide text-ink/40">
            {item.kind === "session" ? "Session" : item.elementType}
          </p>
          <button
            type="button"
            className="rounded-md px-2.5 py-1.5 text-sm text-ink/50 hover:text-danger"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-5 sm:px-6">
          {loading ? (
            <p className="text-sm text-ink/50">Loading…</p>
          ) : null}
          {error ? (
            <p className="font-mono text-sm text-danger">{error}</p>
          ) : null}

          {detail?.kind === "document" ? (
            <div className="flex flex-col gap-8">
              <DocumentEditor
                document={detail.document}
                sessions={detail.sessions}
                canEdit={detail.canEdit}
                compact
                createdByName={detail.createdBy?.display_name ?? null}
                attendeeNames={detail.attendees.map((person) => person.display_name)}
                relateTargets={detail.relateTargets}
                relatedSessionIds={detail.relatedSessionIds}
                relatedDocumentIds={detail.relatedDocumentIds}
                onDeleted={onClose}
              />
              <CommentThread
                targetType="document"
                targetId={detail.document.id}
                initialComments={detail.comments}
                currentUserId={currentUserId}
                isAdmin={detail.isAdmin}
              />
              <p className="text-xs text-ink/40">
                Prefer a full page?{" "}
                <Link
                  href={`/sessions/documents/${detail.document.id}`}
                  className="text-horizon hover:underline"
                >
                  Open document →
                </Link>
              </p>
            </div>
          ) : null}

          {detail?.kind === "session" ? (
            <div className="flex flex-col gap-6">
              <SessionEditor
                session={detail.session}
                nestedDocuments={detail.documents}
                canEdit={detail.canEdit}
                compact
                relateTargets={detail.relateTargets}
                relatedSessionIds={detail.relatedSessionIds}
                relatedDocumentIds={detail.relatedDocumentIds}
                onDeleted={onClose}
              />

              {detail.createdBy?.display_name ? (
                <section className="flex flex-col gap-1">
                  <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                    Created by
                  </h3>
                  <p className="text-sm text-ink/80">
                    {detail.createdBy.display_name}
                  </p>
                </section>
              ) : null}

              {detail.attendees.length >= 2 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                    Attendees
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {detail.attendees.map((person) => (
                      <li
                        key={person.user_id}
                        className="rounded-pill border border-cloud bg-sand/50 px-3 py-1 text-xs text-ink/80"
                      >
                        {person.display_name}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <AttendanceToggle
                sessionId={detail.session.id}
                initialAttending={detail.attending}
              />

              <SessionSummaryTabs detail={detail} />

              <CommentThread
                targetType="session"
                targetId={detail.session.id}
                initialComments={detail.comments}
                currentUserId={currentUserId}
                isAdmin={detail.isAdmin}
              />

              <p className="text-xs text-ink/40">
                <Link
                  href={`/sessions/archive/${detail.session.id}`}
                  className="text-horizon hover:underline"
                >
                  Open full session page →
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
