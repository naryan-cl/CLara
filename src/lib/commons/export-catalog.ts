import type { ExportContentMode } from "@/lib/commons/export";
import type { CommonsListItem } from "@/lib/commons/types";

export type ExportCatalogItem = CommonsListItem & {
  /** Stable key for selection state (`document:uuid` / `session:uuid`). */
  key: string;
  hasTranscript: boolean;
  hasSummary: boolean;
  hasStructured: boolean;
};

export function exportCatalogHasContent(
  item: ExportCatalogItem,
  mode: ExportContentMode,
): boolean {
  if (mode === "transcript") return item.hasTranscript;
  if (mode === "structured") return item.hasStructured;
  return item.hasSummary;
}

export function exportCatalogTypeLabel(item: ExportCatalogItem): string {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return item.type ?? "Document";
}
