import Link from "next/link";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listRecentDocuments } from "@/lib/documents/list-recent";

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

export default async function DashboardPage() {
  const { stream } = await getActiveStream();
  const streamName = stream?.name ?? "Your stream";
  const { documents, error: docsError } = stream
    ? await listRecentDocuments(stream.id, 5)
    : { documents: [], error: null };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          {streamName} Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Core conceptual anchors and recent activity for this stream.
          {stream ? (
            <span className="mt-1 block font-mono text-[11px] text-ink/40">
              {stream.slug}
              {stream.isolation_enabled ? " · isolated" : ""} · {stream.role}
            </span>
          ) : null}
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
            {stream ? "Live query" : "No stream"}
          </span>
        </div>
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          {docsError ? (
            <p className="font-mono text-sm text-danger">
              Could not load documents: {docsError}
              <span className="mt-2 block text-ink/50">
                If the table is missing, run migration{" "}
                <code>0003_documents.sql</code> in the Supabase SQL editor.
              </span>
            </p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-ink/60">
              Nothing here yet — once ingestion (CLara Listens / Receives) is
              built, new session transcripts and summaries will appear here as
              they land in the Commons.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-baseline justify-between gap-4 border-b border-cloud pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {doc.title?.trim() || "Untitled"}
                    </p>
                    <p className="font-mono text-[11px] text-ink/40">
                      {doc.type ?? "untyped"}
                      {doc.needs_review ? " · needs review" : ""}
                    </p>
                  </div>
                  <time className="shrink-0 font-mono text-[11px] text-ink/40">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
