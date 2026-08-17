import { helloWorldFn } from "./hello";
import { okfEnrichFn } from "./okf-enrich";
import { convertUploadFn } from "./convert-upload";
import { embedDocumentFn } from "./embed-document";
import { extractGraphFn } from "./extract-graph";
import { transcribeRecordingFn } from "./transcribe-recording";
import { synthesizeSessionFn } from "./synthesize-session";
import { summarizeDocumentFn } from "./summarize-document";

export { helloWorldFn } from "./hello";
export { okfEnrichFn } from "./okf-enrich";
export { convertUploadFn } from "./convert-upload";
export { embedDocumentFn } from "./embed-document";
export { extractGraphFn } from "./extract-graph";
export { transcribeRecordingFn } from "./transcribe-recording";
export { synthesizeSessionFn } from "./synthesize-session";
export { summarizeDocumentFn } from "./summarize-document";

export const inngestFunctions = [
  helloWorldFn,
  okfEnrichFn,
  convertUploadFn,
  embedDocumentFn,
  extractGraphFn,
  transcribeRecordingFn,
  synthesizeSessionFn,
  summarizeDocumentFn,
];
