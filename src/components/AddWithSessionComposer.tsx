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
  mode: "record" | "upload";
};

/**
 * Shared Add shell for Record / Upload with uniform Connect
 * (Relate + Join code). Record title is document-only — never creates a session.
 */
export function AddWithSessionComposer({
  sessions,
  relateTargets,
  initialSessionIds = [],
  loadError,
  mode,
}: Props) {
  const [selection, setSelection] = useState<ConnectSelection>({
    ...EMPTY_CONNECT,
    sessionIds: initialSessionIds.slice(0, 1),
    sessions: sessions.filter((s) => initialSessionIds.includes(s.id)),
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const recorderRef = useRef<ListensRecorderHandle>(null);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [submitWhileRecordingOpen, setSubmitWhileRecordingOpen] =
    useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSelectionChange = useCallback((next: ConnectSelection) => {
    setSelection(next);
  }, []);

  const resolveSessionIds = useCallback(async () => {
    return {
      ok: true as const,
      sessionIds: selectionRef.current.sessionIds,
    };
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

  function stopRecordingAndSubmit() {
    setSubmitWhileRecordingOpen(false);
    recorderRef.current?.stopAndSubmit();
  }

  const connect = (
    <ConnectPanel
      sessions={sessions}
      relateTargets={relateTargets}
      initialSessionIds={initialSessionIds}
      showDocumentTitle={mode === "record"}
      onSelectionChange={onSelectionChange}
      footer={
        mode === "record" ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleSubmitClick()}
              disabled={capturePhase === "finalizing"}
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
            documentTitle={selection.documentTitle}
            resolveSessionIds={resolveSessionIds}
            relatedDocumentIds={selection.relatedDocumentIds}
            relatedSessionIds={selection.relatedSessionIds}
            onPhaseChange={setCapturePhase}
          />
          {connect}
          {submitWhileRecordingOpen ? (
            <ConfirmDialog
              title="Recording still in progress"
              body="Stop and send this take to Commons, or keep recording."
              confirmLabel="Stop recording and submit"
              onConfirm={stopRecordingAndSubmit}
              onCancel={() => setSubmitWhileRecordingOpen(false)}
            />
          ) : null}
        </>
      ) : (
        <>
          {connect}
          <ReceiveUploadForm
            sessionIds={selection.sessionIds}
            relatedDocumentIds={selection.relatedDocumentIds}
            relatedSessionIds={selection.relatedSessionIds}
          />
        </>
      )}
    </div>
  );
}
