"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AddFab } from "@/components/dashboard/AddFab";
import { AskClaraPanel } from "@/components/dashboard/AskClaraPanel";
import {
  CommonsListPanel,
  ListFab,
} from "@/components/dashboard/CommonsListPanel";
import { ThemePicker } from "@/components/dashboard/ThemePicker";
import { ThemeUnlockPopup } from "@/components/dashboard/ThemeUnlockPopup";
import { KnowledgeMap } from "@/components/KnowledgeMap";
import type { AskScope } from "@/lib/ask/scope";
import { findCommonsItemForGraphNode } from "@/lib/commons/graph-node";
import { commonsItemsToGraph } from "@/lib/commons/to-graph";
import { topLevelCommonsItems } from "@/lib/commons/types";
import type { CommonsListItem } from "@/lib/commons/types";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  type MapLayoutConfig,
} from "@/lib/graph/map-layout-config";
import type { GraphNode } from "@/lib/graph/types";
import { paletteFor, type MapThemeId } from "@/lib/map-theme";
import {
  isRecordingProcessing,
  type RecordingProcessStatus,
} from "@/lib/listens/process-status";
import { pollDocumentProcessStatus } from "@/app/(app)/commons/actions";

type AskHandoff = {
  key: string;
  scope: AskScope;
  question: string;
};

type InitialSelect = { kind: "document" | "session"; id: string };

const PROCESS_POLL_MS = 2800;

/**
 * Dashboard shell: full-bleed Knowledge Map under the nav, with floating
 * Add / List FABs (top-left), theme picker, and Ask host (top-right).
 * Wallpaper + sprites follow the member's unlocked map theme.
 */
export function DashboardGrid({
  items,
  streamId,
  streamName,
  error,
  mapTheme = "plant",
  unlockedThemes = ["plant"],
  pendingUnlock = null,
  initialSelect = null,
  layoutConfig = DEFAULT_MAP_LAYOUT_CONFIG,
}: {
  items: CommonsListItem[];
  streamId: string;
  streamName: string;
  currentUserId: string;
  error?: string | null;
  mapTheme?: MapThemeId;
  unlockedThemes?: MapThemeId[];
  pendingUnlock?: "ocean" | "desert" | null;
  /** Deep-link from Record submit (`?select=document:uuid`). */
  initialSelect?: InitialSelect | null;
  layoutConfig?: MapLayoutConfig;
}) {
  const router = useRouter();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedListItem, setSelectedListItem] =
    useState<CommonsListItem | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [askHandoff, setAskHandoff] = useState<AskHandoff | null>(null);
  const [askScope, setAskScope] = useState<AskScope | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, RecordingProcessStatus>
  >({});
  // Capture deep-link once — URL is cleaned after select so refresh
  // does not keep re-forcing the same recording.
  const [pendingSelect] = useState(initialSelect);
  const listChromeRef = useRef<HTMLDivElement>(null);
  const appliedSelectRef = useRef<string | null>(null);

  const themePalette = paletteFor(mapTheme);

  const displayItems = useMemo(() => {
    if (Object.keys(statusOverrides).length === 0) return items;
    return items.map((item) => {
      if (item.kind !== "document") return item;
      const override = statusOverrides[item.id];
      if (!override) return item;
      return {
        ...item,
        processStatus: override,
        needs_review:
          override === "ready" ? false : override === "failed" || item.needs_review,
      };
    });
  }, [items, statusOverrides]);

  const { nodes, edges } = useMemo(
    () => commonsItemsToGraph(displayItems, streamId),
    [displayItems, streamId],
  );

  const listItems = useMemo(
    () => topLevelCommonsItems(displayItems),
    [displayItems],
  );

  const selectedItemFromMap = useMemo(
    () =>
      selectedNode
        ? findCommonsItemForGraphNode(displayItems, selectedNode)
        : null,
    [displayItems, selectedNode],
  );

  const selectedItemBase = selectedListItem ?? selectedItemFromMap;
  const selectedItem = useMemo(() => {
    if (!selectedItemBase || selectedItemBase.kind !== "document") {
      return selectedItemBase;
    }
    const override = statusOverrides[selectedItemBase.id];
    if (!override) return selectedItemBase;
    return {
      ...selectedItemBase,
      processStatus: override,
      needs_review:
        override === "ready"
          ? false
          : override === "failed" || selectedItemBase.needs_review,
    };
  }, [selectedItemBase, statusOverrides]);

  // Deep-link: select the recording from Record submit and open List for context.
  useEffect(() => {
    if (!pendingSelect) return;
    const key = `${pendingSelect.kind}:${pendingSelect.id}`;
    if (appliedSelectRef.current === key) return;
    const match = displayItems.find(
      (item) =>
        item.kind === pendingSelect.kind && item.id === pendingSelect.id,
    );
    if (!match) return;
    appliedSelectRef.current = key;
    setSelectedNode(null);
    setSelectedListItem(match);
    setListOpen(true);
    // Drop query params so a refresh doesn't re-force selection forever.
    router.replace("/dashboard", { scroll: false });
  }, [pendingSelect, displayItems, router]);

  // Keep list selection in sync when server items refresh after polling.
  useEffect(() => {
    if (!selectedListItem) return;
    const next = displayItems.find(
      (item) =>
        item.kind === selectedListItem.kind && item.id === selectedListItem.id,
    );
    if (!next) return;
    if (
      next.kind === "document" &&
      selectedListItem.kind === "document" &&
      (next.processStatus !== selectedListItem.processStatus ||
        next.needs_review !== selectedListItem.needs_review ||
        next.title !== selectedListItem.title)
    ) {
      setSelectedListItem(next);
    }
  }, [displayItems, selectedListItem]);

  // Poll while the selected recording is still transcribing/summarizing.
  useEffect(() => {
    if (selectedItem?.kind !== "document") return;
    if (!isRecordingProcessing(selectedItem.processStatus)) return;

    const targetId = selectedItem.id;
    let cancelled = false;
    let timer: number | null = null;

    async function tick() {
      const result = await pollDocumentProcessStatus(targetId);
      if (cancelled) return;
      if (result.ok) {
        setStatusOverrides((prev) => ({
          ...prev,
          [targetId]: result.processStatus,
        }));
        setSelectedListItem((prev) =>
          prev && prev.kind === "document" && prev.id === targetId
            ? {
                ...prev,
                title: result.document.title?.trim() || prev.title,
                needs_review: result.document.needs_review,
                processStatus: result.processStatus,
                updated_at: result.document.updated_at,
              }
            : prev,
        );
        if (!isRecordingProcessing(result.processStatus)) {
          router.refresh();
          return;
        }
      }
      timer = window.setTimeout(() => {
        void tick();
      }, PROCESS_POLL_MS);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [
    selectedItem?.kind,
    selectedItem?.id,
    selectedItem && selectedItem.kind === "document"
      ? selectedItem.processStatus
      : null,
    router,
  ]);

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

  const watchProcessing =
    selectedItem?.kind === "document" &&
    isRecordingProcessing(selectedItem.processStatus);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--clara-header-height)] z-0"
      style={{ background: themePalette.base }}
      aria-label="Stream dashboard"
    >
      {/* Map canvas */}
      <div className="absolute inset-0">
        {error ? (
          <div className="flex h-full items-start justify-center p-8">
            <div className="organic-ask max-w-md border border-danger/30 bg-paper/95 p-5 shadow-soft">
              <p className="font-mono text-sm text-danger">{error}</p>
              <p className="mt-2 text-sm text-ink/60">
                If this mentions missing tables or columns, apply Commons
                migrations through{" "}
                <span className="font-mono text-xs">0021_session_gathering</span>{" "}
                in Supabase, then refresh.
              </p>
            </div>
          </div>
        ) : displayItems.length === 0 ? (
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
                Use Add (+) to start a Session, or Reflect / Record / Upload —
                gatherings and stand-alone Adds show on the map; session
                children appear when you open the gathering.
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
            wallpaperTheme={mapTheme}
            wallpaperSeed={`stream:${streamId}`}
            useSprites
            layoutConfig={layoutConfig}
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
              items={listItems}
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

      {/* Theme picker — bottom-left so it stays clear of Ask */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 sm:bottom-6 sm:left-6">
        <ThemePicker activeTheme={mapTheme} unlocked={unlockedThemes} />
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
            mapTheme={mapTheme}
            watchProcessing={watchProcessing}
          />
        </div>
      </div>

      {pendingUnlock ? (
        <ThemeUnlockPopup theme={pendingUnlock} accentTheme={mapTheme} />
      ) : null}
    </div>
  );
}
