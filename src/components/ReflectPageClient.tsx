"use client";

import { useCallback, useState } from "react";
import { ChatForm } from "@/components/ChatForm";
import {
  SessionComposer,
  type SessionComposerSelection,
  EMPTY_DRAFT,
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
  initialSessionIds?: string[];
  loadError?: string | null;
};

export function ReflectPageClient({
  sessions,
  peers,
  initialSessionIds = [],
  loadError,
}: Props) {
  const [selection, setSelection] = useState<SessionComposerSelection>({
    sessionIds: initialSessionIds,
    sessions: sessions.filter((s) => initialSessionIds.includes(s.id)),
    draft: EMPTY_DRAFT,
  });

  const onSelectionChange = useCallback((next: SessionComposerSelection) => {
    setSelection(next);
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Reflect</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Explore your thinking with CLara. The chatbot will ask deepening
          questions to draw out your reflection, surfacing more than just the
          story. Connect this to a session/artifact or leave it as a stand-alone
          reflection.
        </p>
        {loadError ? (
          <p className="mt-2 text-sm text-danger">{loadError}</p>
        ) : null}
      </div>

      <SessionComposer
        sessions={sessions}
        peers={peers}
        initialSessionIds={initialSessionIds}
        createLabel="Create group reflection"
        onSelectionChange={onSelectionChange}
        onCreateSession={createGroupSession}
        onAddParticipants={addParticipantsToSession}
      />

      <ChatForm
        sessionIds={selection.sessionIds}
        connectedSessions={selection.sessions}
      />
    </div>
  );
}
