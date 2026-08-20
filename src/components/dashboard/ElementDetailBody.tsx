"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadCommonsDetail,
  pollDocumentProcessStatus,
  type DetailPayload,
} from "@/app/(app)/commons/actions";
import {
  DocumentReadView,
  SessionReadView,
} from "@/components/commons/ElementReadView";
import { DocumentEditor } from "@/components/DocumentEditor";
import { SessionEditor } from "@/components/SessionEditor";
import type { CommonsListItem } from "@/lib/commons/types";
import { needsElementSummary } from "@/lib/documents/summary";
import { isRecordingProcessing } from "@/lib/listens/process-status";

const DETAIL_POLL_MS = 2800;

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
  watchProcessing = false,
  onTitleChange,
}: {
  item: CommonsListItem;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  onCanEditChange?: (canEdit: boolean) => void;
  onDetailKindChange?: (kind: "document" | "session" | null) => void;
  /** After document delete — parent clears selection. */
  onDeleted?: () => void;
  /** Keep reloading document content while Whisper/summary run. */
  watchProcessing?: boolean;
  /** After session rename — parent header/list can update immediately. */
  onTitleChange?: (title: string) => void;
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
      onCanEditChange?.(result.detail.canEdit);
      onDetailKindChange?.(result.detail.kind);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit callbacks — parent setters are stable enough; avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, item.id]);

  // Refresh transcript/summary while Whisper or the summarize job is still running.
  useEffect(() => {
    if (item.kind !== "document" || loading) return;

    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      const result = await pollDocumentProcessStatus(item.id);
      if (cancelled) return;
      if (!result.ok) {
        timer = window.setTimeout(() => {
          void tick();
        }, DETAIL_POLL_MS);
        return;
      }
      setDetail((prev) =>
        prev && prev.kind === "document"
          ? { ...prev, document: result.document }
          : prev,
      );
      const stillWaiting =
        needsElementSummary(result.document) ||
        isRecordingProcessing(result.processStatus);
      if (stillWaiting) {
        timer = window.setTimeout(() => {
          void tick();
        }, DETAIL_POLL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [item.kind, item.id, loading, watchProcessing]);

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
        createdByName={detail.createdBy?.display_name ?? null}
        attendeeNames={detail.attendees.map((person) => person.display_name)}
        relateTargets={detail.relateTargets}
        relatedSessionIds={detail.relatedSessionIds}
        relatedDocumentIds={detail.relatedDocumentIds}
        onCancelEditing={() => onEditingChange?.(false)}
        onDeleted={() => {
          onEditingChange?.(false);
          onDeleted?.();
        }}
      />
    );
  }

  if (editing && detail.kind === "session") {
    return (
      <SessionEditor
        key={`edit-${detail.session.id}-${detail.session.updated_at}`}
        session={detail.session}
        forceEditing
        nestedDocuments={detail.documents}
        canEdit={detail.canEdit}
        relateTargets={detail.relateTargets}
        relatedSessionIds={detail.relatedSessionIds}
        relatedDocumentIds={detail.relatedDocumentIds}
        onCancelEditing={() => onEditingChange?.(false)}
        onDeleted={() => {
          onEditingChange?.(false);
          onDeleted?.();
        }}
        onSaved={async (session) => {
          const refreshed = await loadCommonsDetail("session", session.id);
          if (refreshed.detail) {
            setDetail(refreshed.detail);
          } else {
            setDetail((prev) =>
              prev && prev.kind === "session" ? { ...prev, session } : prev,
            );
          }
          onTitleChange?.(session.name);
          onEditingChange?.(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {detail.kind === "document" ? (
        <DocumentReadView
          document={detail.document}
          createdByName={detail.createdBy?.display_name ?? null}
          attendeeNames={detail.attendees.map((person) => person.display_name)}
          hideTitle
          canEdit={detail.canEdit}
        />
      ) : (
        <SessionReadView detail={detail} hideTitle />
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
