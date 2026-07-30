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
