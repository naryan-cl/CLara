"use client";

/**
 * Hover / focus glossary chip.
 * `term` underlines a word in running text; `mark` is the little "?" used
 * next to admin labels. Tooltip is the description — never rely on color
 * or jargon alone (DESIGN_GUIDE.md accessibility).
 */
export function HelpTip({
  description,
  label,
  variant = "mark",
  tone = "light",
  placement = "top",
  align = "center",
}: {
  description: string;
  /** Visible text for `term`; ignored for `mark`. */
  label?: string;
  variant?: "mark" | "term";
  tone?: "light" | "dark";
  placement?: "top" | "bottom";
  align?: "center" | "start";
}) {
  const tooltipClass =
    tone === "dark"
      ? "border-sage/40 bg-forest-deep text-paper"
      : "border-cloud bg-paper text-ink";
  const triggerClass =
    variant === "term"
      ? tone === "dark"
        ? "cursor-help border-b border-dotted border-paper/45 text-inherit"
        : "cursor-help border-b border-dotted border-ink/35 text-inherit"
      : tone === "dark"
        ? "flex h-4 w-4 items-center justify-center rounded-full border border-paper/35 font-mono text-[10px] leading-none text-paper/70 hover:border-paper/70 hover:text-paper"
        : "flex h-4 w-4 items-center justify-center rounded-full border border-ink/25 font-mono text-[10px] leading-none text-ink/45 hover:border-ink/50 hover:text-ink";
  const positionClass =
    placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  const alignClass =
    align === "start" ? "left-0" : "left-1/2 -translate-x-1/2";

  return (
    <span className="group relative inline-flex items-center align-middle">
      <button
        type="button"
        className={triggerClass}
        aria-label={
          variant === "mark" ? description : `${label}: ${description}`
        }
      >
        {variant === "term" ? label : "?"}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 w-56 rounded-md border px-2.5 py-2 text-left font-sans text-[11px] font-normal normal-case leading-4 tracking-normal opacity-0 shadow-soft transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${positionClass} ${alignClass} ${tooltipClass}`}
      >
        {description}
      </span>
    </span>
  );
}
