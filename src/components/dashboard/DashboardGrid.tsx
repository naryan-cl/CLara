"use client";

import { useState } from "react";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";
import { ExploreCommonsPanel } from "@/components/dashboard/ExploreCommonsPanel";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

/**
 * Dashboard two-column shell. Node detail slides over Ask CLara so Explore
 * (map/list) keeps its width — Festival-style: canvas stays put, detail overlays.
 */
export function DashboardGrid({
  items,
  streamId,
  currentUserId,
  error,
}: {
  items: CommonsListItem[];
  streamId: string;
  currentUserId: string;
  error?: string | null;
}) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  return (
    <section className="grid min-h-[calc(100vh-9.5rem)] flex-1 gap-5 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
      <ExploreCommonsPanel
        items={items}
        streamId={streamId}
        currentUserId={currentUserId}
        error={error}
        selectedMapNodeId={selectedNode?.id ?? null}
        onMapNodeSelect={setSelectedNode}
      />
      <div className="relative min-h-0 h-full">
        <AskClaraPanel />
        {selectedNode ? (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            className="absolute inset-0 z-20 overflow-auto shadow-lg"
          />
        ) : null}
      </div>
    </section>
  );
}
