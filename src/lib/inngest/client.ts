import { Inngest } from "inngest";

/** App id must match the Inngest dashboard app / sync target. */
export const inngest = new Inngest({ id: "clara" });

/** Smoke-test event — remove once real jobs exist. */
export const CLARA_HELLO = "clara/hello";

/** Sent after a new Commons document is created (Receives, later Listens). */
export const CLARA_DOCUMENT_CREATED = "clara/document.created";

export type ClaraDocumentCreatedEvent = {
  name: typeof CLARA_DOCUMENT_CREATED;
  data: {
    documentId: string;
    streamId: string;
  };
};

/** Sent after a PDF/DOCX lands in Storage, to trigger async Markdown conversion. */
export const CLARA_UPLOAD_RECEIVED = "clara/upload.received";

export type ClaraUploadReceivedEvent = {
  name: typeof CLARA_UPLOAD_RECEIVED;
  data: {
    documentId: string;
    streamId: string;
    storagePath: string;
    fileType: "pdf" | "docx";
  };
};

/**
 * Sent after Listens segments land in Storage (Module B: one or more
 * `{streamId}/{recordingId}/{i}.webm` files).
 */
export const CLARA_RECORDING_RECEIVED = "clara/recording.received";

export type ClaraRecordingReceivedEvent = {
  name: typeof CLARA_RECORDING_RECEIVED;
  data: {
    documentId: string;
    streamId: string;
    recordingId: string;
    segmentCount: number;
    /** MIME type from MediaRecorder (e.g. audio/webm). */
    mimeType: string;
    /** webm or m4a — matches uploaded object names. */
    fileExtension: string;
  };
};

/** Host Finalize on a gathering — synthesize submitted children into a Summary. */
export const CLARA_SESSION_FINALIZED = "clara/session.finalized";

export type ClaraSessionFinalizedEvent = {
  name: typeof CLARA_SESSION_FINALIZED;
  data: {
    sessionId: string;
    streamId: string;
  };
};
