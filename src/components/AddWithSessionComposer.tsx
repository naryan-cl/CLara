"use client";

import { useCallback, useRef, useState } from "react";
import {
  ConfirmDialog,
  ListensRecorder,
  type CapturePhase,
  type ListensRecorderHandle,
} from "@/components/ListensRecorder";
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
 * Record: capture strip first, Session details below with Submit.
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

  const recorderRef = useRef<ListensRecorderHandle>(null);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [submitWhileRecordingOpen, setSubmitWhileRecordingOpen] =
    useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  /** Avoid creating duplicate sessions on repeated “save details”. */
  const savedSessionIdRef = useRef<string | null>(null);

  const onSelectionChange = useCallback((next: SessionComposerSelection) => {
    setSelection(next);
  }, []);

  /**
   * Create a session from Session details Title (once), merge Connections.
   * Used by finalize and by “Save details and continue recording”.
   */
  const resolveSessionIds = useCallback(async () => {
    const { sessionIds, draft } = selectionRef.current;
    let ids = [...sessionIds];

    if (savedSessionIdRef.current) {
      ids = [...new Set([savedSessionIdRef.current, ...ids])].slice(0, 3);
      return { ok: true as const, sessionIds: ids };
    }

    if (draft.name.trim()) {
      const result = await createGroupSession({
        name: draft.name,
        inquiry: draft.inquiry,
        participantUserIds: draft.participantUserIds,
      });
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }
      savedSessionIdRef.current = result.session.id;
      ids = [...new Set([result.session.id, ...ids])].slice(0, 3);
      setSelection((prev) => ({
        ...prev,
        sessionIds: ids,
        sessions: prev.sessions.some((s) => s.id === result.session.id)
          ? prev.sessions
          : [result.session, ...prev.sessions],
      }));
    }

    return { ok: true as const, sessionIds: ids };
  }, []);

  async function handleSubmitClick() {
    setSubmitError(null);
    const handle = recorderRef.current;
    if (!handle) return;

    const phase = handle.getPhase();
    if (phase === "finalizing") return;

    if (phase === "recording" || phase === "paused") {
      setSubmitWhileRecordingOpen(true);
      return;
    }

    if (phase === "stopped" || handle.hasAudio()) {
      await handle.submitStopped();
      return;
    }

    setSubmitError("Record something first, then Submit.");
  }

  async function saveDetailsAndContinue() {
    setSavingDetails(true);
    setSubmitError(null);
    const result = await resolveSessionIds();
    setSavingDetails(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    if (!selectionRef.current.draft.name.trim() && !savedSessionIdRef.current) {
      setSubmitError("Add a Title in Session details to save a session.");
      return;
    }
    setSubmitWhileRecordingOpen(false);
  }

  function stopRecordingAndSubmit() {
    setSubmitWhileRecordingOpen(false);
    recorderRef.current?.stopAndSubmit();
  }

  const composer = (
    <SessionComposer
      sessions={sessions}
      peers={peers}
      createLabel={createLabel}
      variant={mode === "record" ? "details" : "buttons"}
      onSelectionChange={onSelectionChange}
      onCreateSession={createGroupSession}
      onAddParticipants={addParticipantsToSession}
      footer={
        mode === "record" ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleSubmitClick()}
              disabled={capturePhase === "finalizing" || savingDetails}
              className="btn-primary w-full rounded-md bg-forest px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-60 sm:w-auto"
            >
              {capturePhase === "finalizing" ? "Submitting…" : "Submit"}
            </button>
            {submitError ? (
              <p className="font-mono text-sm text-danger">{submitError}</p>
            ) : null}
          </div>
        ) : null
      }
    />
  );

  return (
    <div className="flex flex-col gap-8">
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}

      {mode === "record" ? (
        <>
          <ListensRecorder
            ref={recorderRef}
            documentTitle={selection.draft.name}
            resolveSessionIds={resolveSessionIds}
            onPhaseChange={setCapturePhase}
          />
          {composer}
          {submitWhileRecordingOpen ? (
            <ConfirmDialog
              title="Recording still in progress"
              body="Stop and send this take to Commons, or save the session details and keep recording."
              confirmLabel="Stop recording and submit"
              secondaryLabel={
                savingDetails ? "Saving…" : "Save details and continue"
              }
              onSecondary={() => void saveDetailsAndContinue()}
              onConfirm={stopRecordingAndSubmit}
              onCancel={() => setSubmitWhileRecordingOpen(false)}
            />
          ) : null}
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
