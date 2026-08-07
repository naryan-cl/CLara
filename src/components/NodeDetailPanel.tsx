import Link from "next/link";
import type { GraphNode } from "@/lib/graph/types";

/**
 * Shared node detail chrome for Knowledge Map — used as an overlay on `/map`
 * and as a fallback inside the dashboard Ask host when a node has no Commons item.
 */
export function NodeDetailPanel({
  node,
  onClose,
  className = "",
}: {
  node: GraphNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <aside
      className={`flex flex-col rounded-lg border border-cloud bg-paper p-6 shadow-soft animate-panel-slide-in motion-reduce:animate-none ${className}`.trim()}
      aria-label={`${node.type}: ${node.label}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
          {node.type}
        </span>
        <button
          type="button"
          className="text-xs text-ink/50 hover:text-ink"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <h2 className="mt-2 font-display text-lg font-medium text-ink">
        {node.label}
      </h2>
      {node.description ? (
        <p className="mt-2 text-sm leading-6 text-ink/70">{node.description}</p>
      ) : null}
      {node.sourceDocumentId ? (
        <Link
          href={`/sessions/documents/${node.sourceDocumentId}`}
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          View source document →
        </Link>
      ) : null}
    </aside>
  );
}
