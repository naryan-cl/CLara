import type { CommonsListItem } from "@/lib/commons/types";
import { topLevelCommonsItems } from "@/lib/commons/types";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { recordingProcessLabel } from "@/lib/listens/process-status";

/**
 * Dashboard Commons map uses contribution types — not Knowledge Map
 * Atom/Concept/Framework/Theme extraction vocabulary.
 */
function nodeTypeFor(item: CommonsListItem): string {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return "Upload";
}

function descriptionFor(item: CommonsListItem): string {
  if (item.kind === "session") return "Session in the Commons";
  const bits = [item.type ?? "Document"];
  if (item.privacy_status === "private") bits.push("private");
  if (item.kind === "document") {
    const label = recordingProcessLabel(item.processStatus);
    if (label) bits.push(label.replace("…", "").toLowerCase());
  }
  return bits.join(" · ");
}

/**
 * Turn Commons list items into a lightweight graph for the dashboard map.
 * Only top-level items (sessions + ungrouped Adds) — children hide until
 * the session parent is opened in detail.
 */
export function commonsItemsToGraph(
  items: CommonsListItem[],
  streamId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const topLevel = topLevelCommonsItems(items);

  const nodes: GraphNode[] = topLevel.map((item) => ({
    id: `${item.kind}:${item.id}`,
    streamId,
    type: nodeTypeFor(item),
    label: item.title,
    description: descriptionFor(item),
    sourceDocumentId: item.kind === "document" ? item.id : null,
    createdAt: item.created_at,
    updatedAt: item.created_at,
  }));

  // No document→session edges on the top-level map (children are nested
  // inside session detail instead of drawn as peer nodes).
  return { nodes, edges: [] };
}
