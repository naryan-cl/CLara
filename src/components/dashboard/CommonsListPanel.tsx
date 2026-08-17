"use client";

import Link from "next/link";
import { FadeRise } from "@/components/motion/FadeRise";
import { useResizablePanel } from "@/components/dashboard/useResizablePanel";
import type { CommonsListItem } from "@/lib/commons/types";
import {
  isRecordingProcessing,
  recordingProcessLabel,
} from "@/lib/listens/process-status";

function elementLabel(item: CommonsListItem) {
  if (item.kind === "session") return "Session";
  if (item.elementType === "chat") return "Chat";
  if (item.elementType === "record") return "Record";
  if (item.elementType === "upload") return "Upload";
  return item.type ?? "Document";
}

function statusBits(item: CommonsListItem): string {
  const bits: string[] = [];
  if (item.kind === "document" && item.privacy_status === "private") {
    bits.push("Private");
  }
  if (item.kind === "document") {
    const label = recordingProcessLabel(item.processStatus);
    if (label) bits.push(label);
  }
  return bits.length ? `${bits.join(" · ")} · ` : "";
}

/** Card min width used for auto-fill columns as the pane grows. */
const CARD_MIN = 220;

const LIST_MIN_WIDTH = 280;
const LIST_MAX_WIDTH = 900;
const LIST_MIN_HEIGHT = 240;
const LIST_MAX_HEIGHT = 900;
const LIST_DEFAULT_WIDTH = 352;
const LIST_DEFAULT_HEIGHT = 520;

/**
 * Organic slide panel of Commons cards. Selection opens the same Ask-hosted
 * detail as map node select (parent owns that).
 * Resizable; when wide enough, cards flow into extra columns.
 */
export function CommonsListPanel({
  items,
  error,
  selectedId,
  onSelect,
  onClose,
}: {
  items: CommonsListItem[];
  error?: string | null;
  selectedId?: string | null;
  onSelect: (item: CommonsListItem) => void;
  onClose: () => void;
}) {
  const { size, dragging, startDrag } = useResizablePanel({
    storageKey: "clara.dashboard.listPanel",
    defaultWidth: LIST_DEFAULT_WIDTH,
    defaultHeight: LIST_DEFAULT_HEIGHT,
    minWidth: LIST_MIN_WIDTH,
    maxWidth: LIST_MAX_WIDTH,
    minHeight: LIST_MIN_HEIGHT,
    maxHeight: LIST_MAX_HEIGHT,
  });

  const panelWidth = Math.min(
    size.width,
    typeof window !== "undefined" ? window.innerWidth - 32 : size.width,
  );
  const panelHeight = Math.min(
    size.height,
    typeof window !== "undefined" ? window.innerHeight - 120 : size.height,
  );

  return (
    <aside
      className={`organic-list relative flex min-w-0 flex-col border border-cloud/80 bg-paper/95 shadow-soft ring-1 ring-horizon/15 backdrop-blur-sm animate-panel-slide-in motion-reduce:animate-none max-sm:!h-[min(62dvh,calc(100dvh-var(--clara-header-height)-10rem))] max-sm:!w-full max-sm:!max-w-none ${
        dragging ? "" : ""
      }`}
      style={{
        width: panelWidth,
        height: panelHeight,
        maxWidth: "min(100vw - 2rem, 56rem)",
        maxHeight: "min(85vh, 56rem)",
      }}
      aria-label="Commons list"
    >
      {/* Right edge — grow width rightward (top-left panel). Hidden on phone. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Commons list width"
        onPointerDown={startDrag("width", 1)}
        className="absolute inset-y-3 -right-1 z-10 hidden w-2 cursor-ew-resize rounded-full hover:bg-horizon/25 sm:block"
      />
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Commons list height"
        onPointerDown={startDrag("height", 1)}
        className="absolute inset-x-3 -bottom-1 z-10 hidden h-2 cursor-ns-resize rounded-full hover:bg-horizon/25 sm:block"
      />

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-cloud/70 px-4 py-3">
        <h2 className="font-display text-base font-medium text-ink">Commons</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cloud text-sm text-ink/50 transition-colors hover:border-ink/30 hover:text-ink"
          aria-label="Close list"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
            <p className="font-mono text-sm text-danger">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col gap-2 px-1 py-4">
            <p className="font-display text-sm text-ink">
              The Commons is waiting for its first contribution
            </p>
            <p className="text-sm leading-6 text-ink/60">
              Use Add (+) to Record, Reflect, or Upload. Full filters live on{" "}
              <Link href="/commons" className="text-horizon hover:underline">
                Commons
              </Link>
              .
            </p>
          </div>
        ) : (
          <FadeRise>
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN}px, 1fr))`,
              }}
            >
              {              items.map((item, index) => {
                const id = `${item.kind}-${item.id}`;
                const selected = selectedId === id;
                const processing =
                  item.kind === "document" &&
                  isRecordingProcessing(item.processStatus);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelect(item)}
                    className={`card-press rounded-lg border p-3 text-left shadow-soft transition-[box-shadow,transform,border-color] duration-[var(--duration-ui)] ease-[var(--ease)] animate-fade-rise motion-reduce:animate-none ${
                      selected
                        ? "border-horizon/50 bg-horizon/5"
                        : "border-cloud bg-sand/40 hover:border-sage/50 hover:bg-sand hover:shadow-glow"
                    }`}
                    style={{
                      animationDelay: `${Math.min(index, 5) * 40}ms`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 line-clamp-2 font-display text-sm text-ink">
                        {item.title}
                      </p>
                      <span className="shrink-0 rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
                        {elementLabel(item)}
                      </span>
                    </div>
                    <p
                      className={`mt-1.5 font-mono text-[11px] tracking-wide ${
                        processing ? "text-horizon" : "text-ink/45"
                      }`}
                      aria-live={processing ? "polite" : undefined}
                    >
                      {statusBits(item)}
                      {new Date(
                        item.kind === "session" && item.occurred_at
                          ? item.occurred_at
                          : item.created_at,
                      ).toLocaleDateString()}
                    </p>
                  </button>
                );
              })}
            </div>
          </FadeRise>
        )}
      </div>
    </aside>
  );
}

/**
 * List FAB — toggles the Commons list slide panel.
 */
export function ListFab({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? "Close Commons list" : "Open Commons list"}
      onClick={onToggle}
      className="organic-fab flex h-14 w-14 items-center justify-center border border-cloud/80 bg-paper text-forest shadow-soft ring-1 ring-horizon/15 transition-[transform,box-shadow] duration-[var(--duration-ui)] ease-[var(--ease)] hover:scale-105 hover:shadow-glow"
    >
      <ListIcon />
    </button>
  );
}

function ListIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
