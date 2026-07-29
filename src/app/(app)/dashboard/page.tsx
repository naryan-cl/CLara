import Link from "next/link";

const anchors = [
  {
    name: "Adaptive Capacity",
    description: "How groups stay responsive as conditions shift.",
  },
  {
    name: "Complexity vs. Complication",
    description: "Distinguishing solvable problems from emergent ones.",
  },
  {
    name: "Vertical Development",
    description: "Growth in how meaning gets made, not just what is known.",
  },
];

const entryPoints = [
  { href: "/sessions", label: "Sessions", description: "Browse and add recordings." },
  { href: "/chat", label: "Harvest / Chat", description: "Reflect and contribute." },
  { href: "/map", label: "Knowledge Map", description: "Explore the concept web." },
  { href: "/ask", label: "Ask CLara", description: "Query the Commons." },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Camp CLAI Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Core conceptual anchors and recent activity for this stream.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-ink">
            Core Conceptual Anchors
          </h2>
          <span className="rounded-pill bg-cloud px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Placeholder data
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {anchors.map((anchor) => (
            <div
              key={anchor.name}
              className="rounded-lg border border-cloud bg-paper p-5 shadow-soft"
            >
              <p className="font-display text-lg text-ink">{anchor.name}</p>
              <p className="mt-1 text-sm text-ink/60">{anchor.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-medium text-ink">
          Jump in
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {entryPoints.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              className="rounded-lg border border-cloud bg-paper p-5 shadow-soft transition-colors hover:border-sage"
            >
              <p className="font-medium text-ink">{entry.label}</p>
              <p className="mt-1 text-sm text-ink/60">{entry.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-ink">
            Recent Commons Activity
          </h2>
          <span className="rounded-pill bg-cloud px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Placeholder data
          </span>
        </div>
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/60">
            Nothing here yet — once ingestion (CLara Listens / Receives) is
            built, new session transcripts and summaries will appear here as
            they land in the Commons.
          </p>
        </div>
      </section>
    </div>
  );
}
