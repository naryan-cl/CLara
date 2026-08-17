"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Collapsible admin card. Most /admin sections start closed so the page
 * is scannable; Expand on the right opens the body.
 */
export function AdminSection({
  title,
  description,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Short status shown next to the title even when collapsed (e.g. "3 flagged"). */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="rounded-lg border border-cloud bg-paper shadow-soft">
      <div className="flex items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-medium text-ink">
            {title}
            {hint ? (
              <span className="ml-2 font-sans text-sm font-normal text-ink/45">
                {hint}
              </span>
            ) : null}
          </h2>
          {open && description ? (
            <div className="mt-1 max-w-2xl text-sm text-ink/60">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cloud bg-paper px-3 py-1.5 text-sm text-ink transition hover:bg-sand"
        >
          {open ? "Collapse" : "Expand"}
          <ChevronIcon
            className={`opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {open ? (
        <div id={panelId} className="px-6 pb-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
