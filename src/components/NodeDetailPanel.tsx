"use client";

import Link from "next/link";
import { CloseXButton } from "@/components/CloseXButton";
import { HelpTip } from "@/components/HelpTip";
import { glossaryForNodeType } from "@/lib/graph/node-glossary";
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
  const glossary = glossaryForNodeType(node.type);

  return (
    <aside
      data-km-detail
      className={`pointer-events-auto flex flex-col rounded-lg border border-cloud bg-paper p-6 shadow-soft animate-panel-slide-in motion-reduce:animate-none ${className}`.trim()}
      aria-label={`${node.type}: ${node.label}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-pill border border-sage/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage">
          {glossary ? (
            <HelpTip
              variant="term"
              label={node.type}
              description={glossary}
              placement="bottom"
            />
          ) : (
            node.type
          )}
        </span>
        <CloseXButton onClick={onClose} />
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
