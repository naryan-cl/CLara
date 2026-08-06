"use client";

import { useCallback, useState } from "react";
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
  children: (sessionIds: string[]) => React.ReactNode;
};

/** Shared Add shell: Session Composer above Record / Upload capture UI. */
export function AddWithSessionComposer({
  sessions,
  peers,
  createLabel,
  loadError,
  children,
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
      {children(selection.sessionIds)}
    </div>
  );
}
