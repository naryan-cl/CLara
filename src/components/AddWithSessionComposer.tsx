"use client";

import { useCallback, useState } from "react";
import { ListensRecorder } from "@/components/ListensRecorder";
import { ReceiveUploadForm } from "@/components/ReceiveUploadForm";
import {
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
  /** Which Add capture UI to show under the Session Composer. */
  mode: "record" | "upload";
};

/**
 * Shared Add shell: Session Composer above Record / Upload capture UI.
 *
 * `mode` is used instead of a children render-prop so Server Component pages
 * can pass only serializable props into this Client Component (a function
 * children callback would crash the RSC → client boundary).
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
  });

  const onSelectionChange = useCallback((next: SessionComposerSelection) => {
    setSelection(next);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}
      <SessionComposer
        sessions={sessions}
        peers={peers}
        createLabel={createLabel}
        onSelectionChange={onSelectionChange}
        onCreateSession={createGroupSession}
        onAddParticipants={addParticipantsToSession}
      />
      {mode === "record" ? (
        <ListensRecorder sessionIds={selection.sessionIds} />
      ) : (
        <ReceiveUploadForm sessionIds={selection.sessionIds} />
      )}
    </div>
  );
}
