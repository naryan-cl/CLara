"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadCommonsDetail,
  type DetailPayload,
} from "@/app/(app)/commons/actions";
import { AttendanceToggle } from "@/components/AttendanceToggle";
import { CommentThread } from "@/components/CommentThread";
import { DocumentEditor } from "@/components/DocumentEditor";
import type { CommonsListItem } from "@/lib/commons/types";

/**
 * Minimizable Commons detail popup.
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
  const [minimized, setMinimized] = useState(false);
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

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2 rounded-lg border border-cloud bg-paper px-3 py-2 shadow-soft animate-fade-rise motion-reduce:animate-none">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {item.title}
        </p>
        <button
          type="button"
          className="rounded-md border border-cloud px-2 py-1 text-xs text-ink/70 hover:text-ink"
          onClick={() => setMinimized(false)}
        >
          Restore
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-ink/50 hover:text-danger"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    );
  }

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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded-md border border-cloud px-2.5 py-1.5 text-xs font-medium text-ink/70 hover:text-ink"
              onClick={() => setMinimized(true)}
              title="Minimize"
            >
              Minimize
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-sm text-ink/50 hover:text-danger"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
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
              <div>
                <h2 className="font-display text-xl font-medium text-ink">
                  {detail.session.name}
                </h2>
                <p className="mt-1 font-mono text-[11px] text-ink/40">
                  {detail.session.occurred_at
                    ? new Date(detail.session.occurred_at).toLocaleDateString()
                    : new Date(detail.session.created_at).toLocaleDateString()}
                </p>
              </div>

              <AttendanceToggle
                sessionId={detail.session.id}
                initialAttending={detail.attending}
              />

              <div>
                <h3 className="font-display text-base font-medium text-ink">
                  Documents in this session
                </h3>
                {detail.documents.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/50">
                    No Commons documents tied to this session yet.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {detail.documents.map((doc) => (
                      <li key={doc.id}>
                        <Link
                          href={`/sessions/documents/${doc.id}`}
                          className="text-sm font-medium text-horizon hover:underline"
                        >
                          {doc.title?.trim() || "Untitled"}
                        </Link>
                        <span className="ml-2 font-mono text-[11px] text-ink/40">
                          {doc.type ?? "untyped"}
                          {doc.privacy_status === "private" ? " · private" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
