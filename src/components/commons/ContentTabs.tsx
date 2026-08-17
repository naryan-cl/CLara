"use client";

import { useId, useState } from "react";

export type ContentTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

/**
 * Summary-first tabs for Commons/Dashboard detail.
 * Why: the original transcript or reflection is still one click away,
 * but the first thing you read should be the generated brief.
 */
export function ContentTabs({
  tabs,
  defaultTabId,
}: {
  tabs: ContentTab[];
  defaultTabId?: string;
}) {
  const baseId = useId();
  const initial =
    defaultTabId && tabs.some((tab) => tab.id === defaultTabId)
      ? defaultTabId
      : (tabs[0]?.id ?? "");
  const [activeId, setActiveId] = useState(initial);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (tabs.length === 0) return null;

  if (tabs.length === 1) {
    return <div>{tabs[0].content}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Element content"
        className="flex flex-wrap gap-1 border-b border-cloud"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                selected
                  ? "border-forest text-forest"
                  : "border-transparent text-ink/45 hover:text-ink/70"
              }`}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-${active.id}`}
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
