"use client";

import { useMemo, useState } from "react";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";
import { ExploreCommonsPanel } from "@/components/dashboard/ExploreCommonsPanel";
import { MapElementDetailPanel } from "@/components/dashboard/MapElementDetailPanel";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import type { AskScope } from "@/lib/ask/scope";
import { findCommonsItemForGraphNode } from "@/lib/commons/graph-node";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

type AskHandoff = {
  key: string;
  scope: AskScope;
  question: string;
};

/**
 * Dashboard two-column shell. Map node detail slides over Ask CLara; asking
 * about that element closes the overlay and continues in Ask, scoped.
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
  const [askHandoff, setAskHandoff] = useState<AskHandoff | null>(null);
  const [askScope, setAskScope] = useState<AskScope | null>(null);

  const selectedItem = useMemo(
    () =>
      selectedNode
        ? findCommonsItemForGraphNode(items, selectedNode)
        : null,
    [items, selectedNode],
  );

  function onAskAbout(payload: { question: string; scope: AskScope }) {
    const key = `${Date.now()}-${payload.scope.documentId ?? payload.scope.sessionId}`;
    setAskScope(payload.scope);
    setAskHandoff({
      key,
      scope: payload.scope,
      question: payload.question,
    });
    setSelectedNode(null);
  }

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
        <AskClaraPanel
          formKey={askHandoff?.key ?? "default"}
          scope={askScope}
          initialQuestion={askHandoff?.question ?? null}
          autoSubmitInitial={Boolean(askHandoff?.question)}
          onClearScope={() => {
            setAskScope(null);
            setAskHandoff(null);
          }}
        />
        {selectedItem ? (
          <MapElementDetailPanel
            key={`${selectedItem.kind}-${selectedItem.id}`}
            item={selectedItem}
            onClose={() => setSelectedNode(null)}
            onAskAbout={onAskAbout}
            className="absolute inset-0 z-20 shadow-lg"
          />
        ) : selectedNode ? (
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
