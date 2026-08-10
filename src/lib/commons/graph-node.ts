import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

export type CommonsGraphRef = {
  kind: "document" | "session";
  id: string;
};

/**
 * Dashboard map nodes use synthetic ids (`document:{uuid}` / `session:{uuid}`).
 * Knowledge Map extraction nodes on `/map` are plain UUIDs — this returns null
 * for those so the rich Commons overlay only runs when we have a Commons item.
 */
export function parseCommonsGraphNodeId(
  nodeId: string,
): CommonsGraphRef | null {
  const match = /^(document|session):(.+)$/.exec(nodeId);
  if (!match) return null;
  return {
    kind: match[1] as CommonsGraphRef["kind"],
    id: match[2],
  };
}

export function findCommonsItemForGraphNode(
  items: CommonsListItem[],
  node: GraphNode,
): CommonsListItem | null {
  const ref = parseCommonsGraphNodeId(node.id);
  if (!ref) return null;
  return (
    items.find((item) => item.kind === ref.kind && item.id === ref.id) ?? null
  );
}
