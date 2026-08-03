import { helloWorldFn } from "./hello";
import { okfEnrichFn } from "./okf-enrich";
import { convertUploadFn } from "./convert-upload";
import { embedDocumentFn } from "./embed-document";

export { helloWorldFn } from "./hello";
export { okfEnrichFn } from "./okf-enrich";
export { convertUploadFn } from "./convert-upload";
export { embedDocumentFn } from "./embed-document";

export const inngestFunctions = [
  helloWorldFn,
  okfEnrichFn,
  convertUploadFn,
  embedDocumentFn,
];
