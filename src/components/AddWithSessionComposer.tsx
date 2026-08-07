"use client";

import { useCallback, useRef, useState } from "react";
import { ListensRecorder } from "@/components/ListensRecorder";
import { ReceiveUploadForm } from "@/components/ReceiveUploadForm";
import {
  EMPTY_DRAFT,
  SessionComposer,
  type SessionComposerSelection,
} from "@/components/SessionComposer";
import {
  addParticipantsToSession,
  createGroupSession,
} from "@/app/(app)/sessions/composer-actions";
import type { SessionSummary } from "@/lib/sessions/types";
import type { StreamPeer } from "@/lib/streams/list-stream-peers";

type Props = {
  sessions: SessionSummary[];
  peers: StreamPeer[];
  createLabel: string;
  loadError?: string | null;
  /** Which Add capture UI to show. */
  mode: "record" | "upload";
};

/**
 * Shared Add shell for Record / Upload.
 *
 * Record: capture UI first, then always-open Session details below.
 * Upload: Connect/Create buttons above the upload form.
 */
export function AddWithSessionComposer({
  sessions,
  peers,
  createLabel,
  loadError,
  mode,
}: Props) {
  const [selection, setSelection] = useState<SessionComposerSelection>({
    sessionIds: [],
    sessions: [],
    draft: EMPTY_DRAFT,
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const onSelectionChange = useCallback((next: SessionComposerSelection) => {
    setSelection(next);
  }, []);

  /**
   * Called right before finalize: if Session details Title is filled, create
   * that session (with inquiry/participants), then merge with Connections.
   */
  const resolveSessionIds = useCallback(async () => {
    const { sessionIds, draft } = selectionRef.current;
    let ids = [...sessionIds];

    if (draft.name.trim()) {
      const result = await createGroupSession({
        name: draft.name,
        inquiry: draft.inquiry,
        participantUserIds: draft.participantUserIds,
      });
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      ids = [...new Set([result.session.id, ...ids])].slice(0, 3);
    }

    return { ok: true as const, sessionIds: ids };
  }, []);

  const composer = (
    <SessionComposer
      sessions={sessions}
      peers={peers}
      createLabel={createLabel}
      variant={mode === "record" ? "details" : "buttons"}
      onSelectionChange={onSelectionChange}
      onCreateSession={createGroupSession}
      onAddParticipants={addParticipantsToSession}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {mode === "record" ? (
        <>
          <ListensRecorder
            sessionIds={selection.sessionIds}
            resolveSessionIds={resolveSessionIds}
          />
          {composer}
        </>
      ) : (
        <>
          {composer}
          <ReceiveUploadForm sessionIds={selection.sessionIds} />
        </>
      )}
    </div>
  );
}
