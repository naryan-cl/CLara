"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AskForm } from "@/components/AskForm";
import { ElementDetailBody } from "@/components/dashboard/ElementDetailBody";
import { useResizablePanel } from "@/components/dashboard/useResizablePanel";
import type { AskScope } from "@/lib/ask/scope";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";
import {
  themeAccentButtonStyle,
  type MapThemeId,
} from "@/lib/map-theme";
import { useIsPhone } from "@/lib/ui/use-is-phone";

type AskHostMode = "minimized" | "conversation" | "detail";

const ASK_MIN_WIDTH = 280;
const ASK_MAX_WIDTH = 720;
const ASK_MIN_HEIGHT = 280;
const ASK_MAX_HEIGHT = 900;
const ASK_DEFAULT_WIDTH = 416;
const ASK_DEFAULT_HEIGHT = 640;
const ASK_MINIMIZED_HEIGHT = 148;

/**
 * Floating Ask CLara host (top-right over the map on desktop;
 * centered organic blob on phone).
 *
 * Modes:
 * - minimized: title + entry only
 * - conversation: expanded thread (auto after ask / handoff)
 * - detail: element opens inside the host; on phone this fills the map
 *   view as an overlay so it cannot paint off-screen. Title changes;
 *   Ask entry stays at the bottom.
 *
 * Clicking away re-minimizes when there is no active conversation (and no
 * open element detail). Expanded panes are resizable (left + bottom grips).
 */
export function AskClaraPanel({
  formKey = "default",
  scope = null,
  initialQuestion = null,
  autoSubmitInitial = false,
  onClearScope,
  streamName,
  selectedItem = null,
  selectedNode = null,
  onCloseDetail,
  onAskAbout,
  forceConversation = false,
  mapTheme = null,
  watchProcessing = false,
  onItemTitleChange,
  forceMinimized = false,
  onExpand,
}: {
  formKey?: string;
  scope?: AskScope | null;
  initialQuestion?: string | null;
  autoSubmitInitial?: boolean;
  onClearScope?: () => void;
  streamName?: string;
  selectedItem?: CommonsListItem | null;
  /** Fallback when a map node has no Commons list match. */
  selectedNode?: GraphNode | null;
  onCloseDetail?: () => void;
  onAskAbout?: (payload: { question: string; scope: AskScope }) => void;
  /** Parent sets true after a handoff so we open in conversation mode. */
  forceConversation?: boolean;
  /** Active dashboard map theme — tints Ask chrome. */
  mapTheme?: MapThemeId | null;
  /** Poll detail while Listens Whisper/OKF is still running. */
  watchProcessing?: boolean;
  /** After an in-pane rename so the map/list can update immediately. */
  onItemTitleChange?: (title: string) => void;
  /** Phone List sheet is open — collapse Ask so the two do not stack. */
  forceMinimized?: boolean;
  /** Fires when Ask leaves minimized (conversation or detail) so List can close. */
  onExpand?: () => void;
} = {}) {
  const rootRef = useRef<HTMLElement>(null);
  const onExpandRef = useRef(onExpand);
  useEffect(() => {
    onExpandRef.current = onExpand;
  }, [onExpand]);
  const [conversationOpen, setConversationOpen] = useState(
    Boolean(forceConversation || autoSubmitInitial),
  );
  const [hasConversation, setHasConversation] = useState(false);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [detailKind, setDetailKind] = useState<"document" | "session" | null>(
    null,
  );
  const [detailDraft, setDetailDraft] = useState("");
  const [detailAskError, setDetailAskError] = useState<string | null>(null);
  const [detailTitleOverride, setDetailTitleOverride] = useState<string | null>(
    null,
  );
  const [keyboardInset, setKeyboardInset] = useState(0);
  const isPhone = useIsPhone();

  const { size, dragging, startDrag } = useResizablePanel({
    storageKey: "clara.dashboard.askPanel",
    defaultWidth: ASK_DEFAULT_WIDTH,
    defaultHeight: ASK_DEFAULT_HEIGHT,
    minWidth: ASK_MIN_WIDTH,
    maxWidth: ASK_MAX_WIDTH,
    minHeight: ASK_MIN_HEIGHT,
    maxHeight: ASK_MAX_HEIGHT,
  });

  useEffect(() => {
    if (!(forceConversation || autoSubmitInitial)) return;
    queueMicrotask(() => {
      setConversationOpen(true);
      onExpandRef.current?.();
    });
  }, [forceConversation, autoSubmitInitial, formKey]);

  useEffect(() => {
    if (!forceMinimized) return;
    queueMicrotask(() => setConversationOpen(false));
  }, [forceMinimized]);

  useEffect(() => {
    function sync() {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setKeyboardInset(inset);
    }
    const viewport = window.visualViewport;
    if (!viewport) return;
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setEditing(false);
      setCanEdit(false);
      setDetailKind(null);
      setDetailDraft("");
      setDetailAskError(null);
      setDetailTitleOverride(null);
    });
  }, [selectedItem?.id, selectedItem?.kind, selectedNode?.id]);

  const inDetail = Boolean(selectedItem || selectedNode);
  const mode: AskHostMode = inDetail
    ? "detail"
    : conversationOpen && !forceMinimized
      ? "conversation"
      : "minimized";

  // Click away → minimize when there's no live thread and no detail open.
  useEffect(() => {
    if (inDetail || hasConversation || !conversationOpen) return;

    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setConversationOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConversationOpen(false);
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [inDetail, hasConversation, conversationOpen]);

  const detailTitle =
    detailTitleOverride ??
    selectedItem?.title ??
    selectedNode?.label ??
    "Details";

  function buildScope(): AskScope | null {
    if (!selectedItem) return null;
    if (selectedItem.kind === "session") {
      return { sessionId: selectedItem.id, label: selectedItem.title };
    }
    return { documentId: selectedItem.id, label: selectedItem.title };
  }

  function onDetailAskSubmit(event: React.FormEvent) {
    event.preventDefault();
    const question = detailDraft.trim();
    if (!question) {
      setDetailAskError("Ask something about this element first.");
      return;
    }
    const nextScope = buildScope();
    if (!nextScope || !onAskAbout) {
      setDetailAskError("This node is not linked to a Commons item yet.");
      return;
    }
    setDetailAskError(null);
    onAskAbout({ question, scope: nextScope });
  }

  const showEdit =
    mode === "detail" &&
    canEdit &&
    (detailKind === "document" || detailKind === "session");

  const fillOverlay = isPhone && mode === "detail";
  const panelWidth = Math.min(
    size.width,
    typeof window !== "undefined" ? window.innerWidth - 32 : size.width,
  );
  const panelHeight =
    mode === "minimized"
      ? ASK_MINIMIZED_HEIGHT
      : Math.min(
          size.height,
          typeof window !== "undefined" ? window.innerHeight - 96 : size.height,
        );

  const iconBtnClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-cloud text-ink/55 transition-colors hover:border-ink/30 hover:text-ink";

  return (
    <section
      ref={rootRef}
      className={`organic-ask relative flex min-h-0 min-w-0 flex-col overflow-hidden border border-horizon/30 bg-paper/95 shadow-soft ring-1 ring-horizon/15 backdrop-blur-sm ${
        mode === "minimized"
          ? "max-sm:!h-auto max-sm:!max-h-none"
          : mode === "detail"
            ? "max-sm:!h-full max-sm:!w-full max-sm:!max-h-none max-sm:!max-w-none max-sm:flex-1"
            : "max-sm:!h-[min(82dvh,calc(100dvh-var(--clara-header-height)-2.5rem))] max-sm:!max-h-[min(82dvh,calc(100dvh-var(--clara-header-height)-2.5rem))]"
      } ${
        dragging
          ? ""
          : "transition-[width,height,max-height] duration-[var(--duration-ui)] ease-[var(--ease)]"
      }`}
      style={{
        width: fillOverlay ? "100%" : panelWidth,
        height: fillOverlay ? "100%" : panelHeight,
        maxWidth: fillOverlay ? "none" : "min(100vw - 2rem, 45rem)",
        maxHeight: fillOverlay
          ? "none"
          : mode === "minimized"
            ? undefined
            : "min(85vh, 56rem)",
        paddingBottom:
          keyboardInset > 0 ? keyboardInset : undefined,
      }}
      aria-label={mode === "detail" ? detailTitle : "Ask CLara"}
    >
      {/* Left edge — grow width leftward (top-right panel). Hidden on phone. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Ask panel width"
        onPointerDown={startDrag("width", -1)}
        className="absolute inset-y-3 -left-1 z-10 hidden w-2 cursor-ew-resize rounded-full hover:bg-horizon/25 sm:block"
      />
      {mode !== "minimized" ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Ask panel height"
          onPointerDown={startDrag("height", 1)}
          className="absolute inset-x-3 -bottom-1 z-10 hidden h-2 cursor-ns-resize rounded-full hover:bg-horizon/25 sm:block"
        />
      ) : null}

      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="min-w-0 font-display text-lg font-medium text-ink">
          {mode === "detail" ? (
            <span className="line-clamp-2">{detailTitle}</span>
          ) : (
            "Ask CLara"
          )}
        </h2>
        {mode === "detail" ? (
          <div className="flex shrink-0 items-center gap-2">
            {showEdit ? (
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                className={`${iconBtnClass} hover:border-horizon/40 hover:text-horizon`}
                aria-label={
                  editing
                    ? "Stop editing"
                    : detailKind === "session"
                      ? "Edit session"
                      : "Edit document"
                }
                aria-pressed={editing}
              >
                <EditIcon />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                onCloseDetail?.();
              }}
              className={iconBtnClass}
              aria-label="Close detail"
            >
              ×
            </button>
          </div>
        ) : mode === "conversation" ? (
          <button
            type="button"
            onClick={() => setConversationOpen(false)}
            className={iconBtnClass}
            aria-label="Minimize Ask CLara"
          >
            ×
          </button>
        ) : hasConversation && !forceMinimized ? (
          <button
            type="button"
            onClick={() => setConversationOpen(true)}
            className={iconBtnClass}
            aria-label="Expand Ask CLara"
          >
            ↑
          </button>
        ) : null}
      </header>

      {mode === "detail" && selectedItem ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
            <ElementDetailBody
              key={`${selectedItem.kind}-${selectedItem.id}`}
              item={selectedItem}
              editing={editing}
              onEditingChange={setEditing}
              onCanEditChange={setCanEdit}
              onDetailKindChange={setDetailKind}
              watchProcessing={watchProcessing}
              onTitleChange={(title) => {
                setDetailTitleOverride(title);
                onItemTitleChange?.(title);
              }}
              onDeleted={() => {
                setEditing(false);
                onCloseDetail?.();
              }}
            />
          </div>
          <form
            onSubmit={onDetailAskSubmit}
            className="flex shrink-0 flex-col gap-2 border-t border-horizon/25 px-5 py-4"
          >
            <label htmlFor="ask-host-detail-question" className="sr-only">
              Ask about this element
            </label>
            <textarea
              id="ask-host-detail-question"
              value={detailDraft}
              onChange={(event) => setDetailDraft(event.target.value)}
              rows={2}
              placeholder={
                selectedItem.kind === "session"
                  ? "What themes showed up in this session?"
                  : "What stands out in this piece?"
              }
              className="rounded-md border border-cloud bg-sand/40 p-3 text-base text-ink outline-none focus:border-horizon sm:text-sm"
            />
            {detailAskError ? (
              <p className="text-sm text-danger">{detailAskError}</p>
            ) : null}
            <button
              type="submit"
              className={
                mapTheme
                  ? "btn-primary organic-ask-btn min-h-11 self-start px-4 py-2 text-sm font-medium"
                  : "btn-primary organic-ask-btn min-h-11 self-start bg-forest px-4 py-2 text-sm font-medium text-paper ring-1 ring-glow/30"
              }
              style={mapTheme ? themeAccentButtonStyle(mapTheme) : undefined}
            >
              Ask
            </button>
          </form>
        </>
      ) : null}

      {mode === "detail" && !selectedItem && selectedNode ? (
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
            {selectedNode.type}
          </p>
          {selectedNode.description ? (
            <p className="mt-3 text-sm leading-6 text-ink/70">
              {selectedNode.description}
            </p>
          ) : (
            <p className="mt-3 text-sm text-ink/50">
              No Commons summary is linked to this node yet.
            </p>
          )}
          {selectedNode.sourceDocumentId ? (
            <p className="mt-4 text-xs text-ink/40">
              <Link
                href={`/sessions/documents/${selectedNode.sourceDocumentId}`}
                className="text-horizon hover:underline"
              >
                View source document →
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {mode !== "detail" ? (
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
          <AskForm
            key={formKey}
            embedded
            scope={scope}
            initialQuestion={initialQuestion}
            autoSubmitInitial={autoSubmitInitial}
            onClearScope={onClearScope}
            minimized={mode === "minimized"}
            streamName={streamName}
            onConversationActive={() => {
              setConversationOpen(true);
              onExpandRef.current?.();
            }}
            onHasConversationChange={setHasConversation}
            accentTheme={mapTheme}
          />
        </div>
      ) : null}
    </section>
  );
}

function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}
