/**
 * CLara "thinking" indicator — soft breathing glow, not a spinner.
 * Shared by Ask and Chat so presence language matches without mixing pipelines.
 * Always keep the text label (a11y: motion is not the only status signal).
 */
export function ThinkingPresence({
  label = "CLara is thinking…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex items-center gap-2.5"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-glow shadow-glow animate-clara-breathe motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
        {label}
      </span>
    </div>
  );
}
