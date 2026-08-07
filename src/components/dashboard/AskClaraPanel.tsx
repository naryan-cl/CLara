"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AskForm } from "@/components/AskForm";
import { ElementDetailBody } from "@/components/dashboard/ElementDetailBody";
import type { AskScope } from "@/lib/ask/scope";
import type { CommonsListItem } from "@/lib/commons/types";
import type { GraphNode } from "@/lib/graph/types";

type AskHostMode = "minimized" | "conversation" | "detail";

/**
 * Floating Ask CLara host (top-right over the map).
 *
 * Modes:
 * - minimized: title + entry only
 * - conversation: expanded thread (auto after ask / handoff)
 * - detail: element opens inside the host; title changes; entry stays at bottom
 *
 * Clicking away re-minimizes when there is no active conversation (and no
 * open element detail).
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
} = {}) {
  const rootRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (forceConversation || autoSubmitInitial) {
      setConversationOpen(true);
    }
  }, [forceConversation, autoSubmitInitial, formKey]);

  useEffect(() => {
    setEditing(false);
    setCanEdit(false);
    setDetailKind(null);
    setDetailDraft("");
    setDetailAskError(null);
  }, [selectedItem?.id, selectedItem?.kind, selectedNode?.id]);

  const inDetail = Boolean(selectedItem || selectedNode);
  const mode: AskHostMode = inDetail
    ? "detail"
    : conversationOpen
      ? "conversation"
      : "minimized";

  // Click away → minimize when there's no live thread and no detail open.
  useEffect(() => {
    if (inDetail || hasConversation || !conversationOpen) return;

    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setConversationOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConversationOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [inDetail, hasConversation, conversationOpen]);

  const detailTitle =
    selectedItem?.title ?? selectedNode?.label ?? "Details";

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
    selectedItem?.kind === "document" &&
    canEdit &&
    detailKind === "document";

  return (
    <section
      ref={rootRef}
      className={`organic-ask flex flex-col border border-horizon/30 bg-paper/95 shadow-soft ring-1 ring-horizon/15 backdrop-blur-sm transition-[width,height,max-height] duration-[var(--duration-ui)] ease-[var(--ease)] ${
        mode === "minimized"
          ? "w-[min(100vw-2rem,22rem)]"
          : "h-[min(78vh,40rem)] w-[min(100vw-2rem,26rem)]"
      }`}
      aria-label={mode === "detail" ? detailTitle : "Ask CLara"}
    >
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
                className="flex h-8 w-8 items-center justify-center rounded-full border border-cloud text-ink/55 transition-colors hover:border-horizon/40 hover:text-horizon"
                aria-label={editing ? "Stop editing" : "Edit document"}
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
              className="flex h-8 w-8 items-center justify-center rounded-full border border-cloud text-ink/55 transition-colors hover:border-ink/30 hover:text-ink"
              aria-label="Close detail"
            >
              ×
            </button>
          </div>
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
              className="rounded-md border border-cloud bg-sand/40 p-3 text-sm text-ink outline-none focus:border-horizon"
            />
            {detailAskError ? (
              <p className="text-sm text-danger">{detailAskError}</p>
            ) : null}
            <button
              type="submit"
              className="btn-primary organic-ask-btn self-start bg-forest px-4 py-2 text-sm font-medium text-paper ring-1 ring-glow/30"
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
            onConversationActive={() => setConversationOpen(true)}
            onHasConversationChange={setHasConversation}
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
