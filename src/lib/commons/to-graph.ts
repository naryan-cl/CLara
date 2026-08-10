import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { recordingProcessLabel } from "@/lib/listens/process-status";

function nodeTypeFor(item: CommonsListItem): string {
  if (item.kind === "session") return "Framework";
  if (item.elementType === "chat") return "Concept";
  if (item.elementType === "record") return "Theme";
  if (item.elementType === "upload") return "Atom";
  return "Atom";
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
 * Documents link to their session when both are present; otherwise nodes
 * float alone so contributors still appear before Knowledge Map extraction.
 */
export function commonsItemsToGraph(
  items: CommonsListItem[],
  streamId: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = items.map((item) => ({
    id: `${item.kind}:${item.id}`,
    streamId,
    type: nodeTypeFor(item),
    label: item.title,
    description: descriptionFor(item),
    sourceDocumentId: item.kind === "document" ? item.id : null,
    createdAt: item.created_at,
    updatedAt: item.created_at,
  }));

  const sessionNodeIds = new Map<string, string>();
  for (const item of items) {
    if (item.kind === "session") {
      sessionNodeIds.set(item.id, `session:${item.id}`);
    }
  }

  const edges: GraphEdge[] = [];
  for (const item of items) {
    if (item.kind !== "document" || !item.session_id) continue;
    const sessionNodeId = sessionNodeIds.get(item.session_id);
    if (!sessionNodeId) continue;
    edges.push({
      id: `edge:document:${item.id}:session:${item.session_id}`,
      streamId,
      sourceNodeId: `document:${item.id}`,
      targetNodeId: sessionNodeId,
      relationship: "part of",
      sourceDocumentId: item.id,
      createdAt: item.created_at,
      updatedAt: item.created_at,
    });
  }

  return { nodes, edges };
}
