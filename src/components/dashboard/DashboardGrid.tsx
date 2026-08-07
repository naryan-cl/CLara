"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddFab } from "@/components/dashboard/AddFab";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";
import {
  CommonsListPanel,
  ListFab,
} from "@/components/dashboard/CommonsListPanel";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import type { AskScope } from "@/lib/ask/scope";
import { findCommonsItemForGraphNode } from "@/lib/commons/graph-node";
import { commonsItemsToGraph } from "@/lib/commons/to-graph";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

type AskHandoff = {
  key: string;
  scope: AskScope;
  question: string;
};

/**
 * Dashboard shell: full-bleed Knowledge Map under the nav, with floating
 * Add / List FABs (top-left) and Ask host (top-right). Element detail
 * opens inside Ask (title changes, entry stays at the bottom).
 */
export function DashboardGrid({
  items,
  streamId,
  streamName,
  error,
}: {
  items: CommonsListItem[];
  streamId: string;
  streamName: string;
  currentUserId: string;
  error?: string | null;
}) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedListItem, setSelectedListItem] =
    useState<CommonsListItem | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [askHandoff, setAskHandoff] = useState<AskHandoff | null>(null);
  const [askScope, setAskScope] = useState<AskScope | null>(null);
  const listChromeRef = useRef<HTMLDivElement>(null);

  const { nodes, edges } = useMemo(
    () => commonsItemsToGraph(items, streamId),
    [items, streamId],
  );

  const selectedItemFromMap = useMemo(
    () =>
      selectedNode
        ? findCommonsItemForGraphNode(items, selectedNode)
        : null,
    [items, selectedNode],
  );

  const selectedItem = selectedListItem ?? selectedItemFromMap;

  useEffect(() => {
    if (!listOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setListOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!listChromeRef.current?.contains(event.target as Node)) {
        setListOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [listOpen]);

  function clearSelection() {
    setSelectedNode(null);
    setSelectedListItem(null);
  }

  function onMapNodeSelect(node: GraphNode | null) {
    setSelectedListItem(null);
    setSelectedNode(node);
  }

  function onListSelect(item: CommonsListItem) {
    setSelectedNode(null);
    setSelectedListItem(item);
  }

  function onAskAbout(payload: { question: string; scope: AskScope }) {
    const key = `${Date.now()}-${payload.scope.documentId ?? payload.scope.sessionId}`;
    setAskScope(payload.scope);
    setAskHandoff({
      key,
      scope: payload.scope,
      question: payload.question,
    });
    clearSelection();
  }

  const selectedMapNodeId = selectedItem
    ? `${selectedItem.kind}:${selectedItem.id}`
    : (selectedNode?.id ?? null);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--clara-header-height)] z-0 bg-forest-deep"
      aria-label="Stream dashboard"
    >
      {/* Map canvas */}
      <div className="absolute inset-0">
        {error ? (
          <div className="flex h-full items-start justify-center p-8">
            <div className="organic-ask max-w-md border border-danger/30 bg-paper/95 p-5 shadow-soft">
              <p className="font-mono text-sm text-danger">{error}</p>
              <p className="mt-2 text-sm text-ink/60">
                If this mentions missing tables or infinite recursion, check
                Commons migrations (
                <span className="font-mono text-xs">0011</span>–
                <span className="font-mono text-xs">0013</span>) in Supabase,
                then refresh.
              </p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="organic-ask relative max-w-md overflow-hidden border border-sage/30 bg-paper/95 p-6 shadow-soft">
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-glow/25 blur-2xl animate-clara-breathe motion-reduce:animate-none"
                aria-hidden="true"
              />
              <p className="relative font-display text-base text-ink">
                The Commons is waiting for its first contribution
              </p>
              <p className="relative mt-2 text-sm leading-6 text-ink/60">
                Use Add (+) to Record, Reflect, or Upload — items show up on
                the map and in List as soon as they land in this stream.
              </p>
            </div>
          </div>
        ) : (
          <KnowledgeMap
            nodes={nodes}
            edges={edges}
            selectedId={selectedMapNodeId}
            onSelect={onMapNodeSelect}
            hideDetailPanel
            hideChrome
            className="h-full w-full rounded-none border-0"
          />
        )}
      </div>

      {/* Top-left chrome: Add / List */}
      <div
        ref={listChromeRef}
        className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col items-start gap-3 sm:left-6 sm:top-5"
      >
        <div className="pointer-events-auto flex flex-col items-start gap-3">
          <div className="flex items-center gap-3">
            <AddFab menuAlign="start" />
            <ListFab
              open={listOpen}
              onToggle={() => setListOpen((value) => !value)}
            />
          </div>
          {listOpen ? (
            <CommonsListPanel
              items={items}
              error={error}
              selectedId={
                selectedItem
                  ? `${selectedItem.kind}-${selectedItem.id}`
                  : null
              }
              onSelect={onListSelect}
              onClose={() => setListOpen(false)}
            />
          ) : null}
        </div>
      </div>

      {/* Ask host — top right */}
      <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <div className="pointer-events-auto">
          <AskClaraPanel
            formKey={askHandoff?.key ?? "default"}
            scope={askScope}
            initialQuestion={askHandoff?.question ?? null}
            autoSubmitInitial={Boolean(askHandoff?.question)}
            forceConversation={Boolean(askHandoff?.question)}
            onClearScope={() => {
              setAskScope(null);
              setAskHandoff(null);
            }}
            streamName={streamName}
            selectedItem={selectedItem}
            selectedNode={selectedItem ? null : selectedNode}
            onCloseDetail={clearSelection}
            onAskAbout={onAskAbout}
          />
        </div>
      </div>
    </div>
  );
}
