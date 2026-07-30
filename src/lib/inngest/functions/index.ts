import { helloWorldFn } from "./hello";
import { okfEnrichFn } from "./okf-enrich";
import { convertUploadFn } from "./convert-upload";

export { helloWorldFn } from "./hello";
export { okfEnrichFn } from "./okf-enrich";
export { convertUploadFn } from "./convert-upload";

export const inngestFunctions = [helloWorldFn, okfEnrichFn, convertUploadFn];
