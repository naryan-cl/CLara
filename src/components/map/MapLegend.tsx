"use client";

import { HelpTip } from "@/components/HelpTip";
import {
  DASHBOARD_NODE_TYPES,
  KNOWLEDGE_MAP_NODE_TYPES,
  colorForNodeType,
  glossaryForNodeType,
} from "@/lib/graph/node-glossary";
import { CLOSENESS_GLOSSARY } from "@/lib/graph/closeness";
import { radiusFor } from "@/lib/graph/layout";
import type { MapLayoutConfig } from "@/lib/graph/map-layout-config";

/**
 * Overlay legend: colour = type.
 * On the Knowledge Map, size = SNA closeness (not type).
 * On the Dashboard, size still follows contribution type.
 */
export function MapLegend({
  variant = "knowledgeMap",
  sizeMode = "closeness",
  layoutConfig,
  className = "",
}: {
  variant?: "knowledgeMap" | "dashboard";
  sizeMode?: "closeness" | "type";
  layoutConfig: MapLayoutConfig;
  className?: string;
}) {
  const types =
    variant === "dashboard" ? DASHBOARD_NODE_TYPES : KNOWLEDGE_MAP_NODE_TYPES;
  const showClosenessSize = sizeMode === "closeness";
  const maxTypeR = Math.max(
    ...types.map((type) => radiusFor(type, layoutConfig)),
  );

  return (
    <div
      data-km-chrome
      className={`pointer-events-auto rounded-md border border-paper/15 bg-forest-deep/80 px-3 py-2.5 shadow-soft backdrop-blur-sm ${className}`.trim()}
      aria-label={
        variant === "dashboard"
          ? "Dashboard map legend"
          : "Knowledge Map legend"
      }
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-paper/45">
        Colour is type
      </p>
      <ul className="flex flex-col gap-1.5">
        {types.map((type) => {
          const r = showClosenessSize
            ? 8
            : Math.max(5, Math.round((radiusFor(type, layoutConfig) / maxTypeR) * 10));
          const glossary = glossaryForNodeType(type);
          return (
            <li key={type} className="flex items-center gap-2">
              <span
                className="inline-block shrink-0 rounded-full"
                style={{
                  width: r,
                  height: r,
                  background: colorForNodeType(type),
                }}
                aria-hidden="true"
              />
              {glossary ? (
                <HelpTip
                  variant="term"
                  tone="dark"
                  placement="top"
                  align="start"
                  label={type}
                  description={glossary}
                />
              ) : (
                <span className="font-mono text-[11px] text-paper/80">
                  {type}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {showClosenessSize ? (
        <div className="mt-3 border-t border-paper/10 pt-2">
          <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-paper/45">
            Size is closeness
            <HelpTip
              description={CLOSENESS_GLOSSARY}
              tone="dark"
              placement="top"
              align="start"
            />
          </p>
          <div className="flex items-center gap-3 text-paper/70">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block rounded-full bg-paper/70"
                style={{ width: 6, height: 6 }}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px]">farther</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block rounded-full bg-paper/70"
                style={{ width: 14, height: 14 }}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px]">closer</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-2 max-w-[11rem] font-mono text-[10px] leading-4 text-paper/40">
          Colour is type · size follows the admin knobs for each Commons type
        </p>
      )}
    </div>
  );
}
