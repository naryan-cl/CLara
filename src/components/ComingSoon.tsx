export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-cloud bg-paper p-8 shadow-soft">
      <span className="rounded-pill bg-warning/15 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-warning">
        Coming in a later phase
      </span>
      <h1 className="font-display text-2xl font-medium text-ink">{title}</h1>
      <p className="max-w-lg text-sm leading-6 text-ink/70">{description}</p>
    </div>
  );
}
