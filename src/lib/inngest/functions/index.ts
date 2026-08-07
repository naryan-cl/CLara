import { helloWorldFn } from "./hello";
import { okfEnrichFn } from "./okf-enrich";
import { convertUploadFn } from "./convert-upload";
import { embedDocumentFn } from "./embed-document";
import { extractGraphFn } from "./extract-graph";
import { transcribeRecordingFn } from "./transcribe-recording";

export { helloWorldFn } from "./hello";
export { okfEnrichFn } from "./okf-enrich";
export { convertUploadFn } from "./convert-upload";
export { embedDocumentFn } from "./embed-document";
export { extractGraphFn } from "./extract-graph";
export { transcribeRecordingFn } from "./transcribe-recording";

export const inngestFunctions = [
  helloWorldFn,
  okfEnrichFn,
  convertUploadFn,
  embedDocumentFn,
  extractGraphFn,
  transcribeRecordingFn,
];
