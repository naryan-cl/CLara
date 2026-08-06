/**
 * Subtle “listening” presence for an empty Reflect chat window.
 */
export function ListeningPresence() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 py-10"
      role="status"
      aria-live="polite"
    >
      <span
        className="relative inline-flex h-16 w-16 items-center justify-center"
        aria-hidden="true"
      >
        <span className="absolute inset-0 rounded-full bg-glow/20 blur-md animate-clara-breathe motion-reduce:animate-none" />
        <span className="absolute inset-3 rounded-full bg-glow/25 animate-clara-breathe motion-reduce:animate-none" />
        <span className="relative h-3 w-3 rounded-full bg-sage/80 shadow-glow" />
      </span>
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/35">
        CLara is listening
      </p>
    </div>
  );
}
