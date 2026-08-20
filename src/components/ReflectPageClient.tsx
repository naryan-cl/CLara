"use client";

import { useCallback, useState } from "react";
import { ChatForm } from "@/components/ChatForm";
import { HelpTip } from "@/components/HelpTip";
import {
  ConnectPanel,
  EMPTY_CONNECT,
  type ConnectSelection,
  type RelateTarget,
} from "@/components/ConnectPanel";
import type { SessionSummary } from "@/lib/sessions/types";

type Props = {
  sessions: SessionSummary[];
  relateTargets: RelateTarget[];
  initialSessionIds?: string[];
  loadError?: string | null;
};

export function ReflectPageClient({
  sessions,
  relateTargets,
  initialSessionIds = [],
  loadError,
}: Props) {
  const [selection, setSelection] = useState<ConnectSelection>({
    ...EMPTY_CONNECT,
    sessionIds: initialSessionIds.slice(0, 1),
    sessions: sessions.filter((s) => initialSessionIds.includes(s.id)),
  });

  const onSelectionChange = useCallback((next: ConnectSelection) => {
    setSelection(next);
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Reflect{" "}
          <HelpTip description="Reflect is a one-on-one conversation with CLara. It cannot see other people's Commons contributions — unlike Ask CLara. Reflections are private by default; uncheck Private to share to the Commons." />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Explore your thinking with CLara. Connect to an open Session from
          the dropdown (or paste a join code), Relate to other Commons
          elements — or leave this as a stand-alone reflection.
        </p>
        {loadError ? (
          <p className="mt-2 text-sm text-danger">{loadError}</p>
        ) : null}
      </div>

      <ConnectPanel
        sessions={sessions}
        relateTargets={relateTargets}
        initialSessionIds={initialSessionIds}
        onSelectionChange={onSelectionChange}
      />

      <ChatForm
        sessionIds={selection.sessionIds}
        connectedSessions={selection.sessions}
        relatedDocumentIds={selection.relatedDocumentIds}
        relatedSessionIds={selection.relatedSessionIds}
      />
    </div>
  );
}
