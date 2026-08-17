import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-sand">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-sage">
          CLara Platform
        </p>

        <h1 className="max-w-xl font-display text-4xl font-medium leading-tight text-ink sm:text-5xl">
          The shared brain for <em className="italic">collective thinking</em>.
        </h1>

        <p className="max-w-lg text-lg leading-8 text-ink/70">
          CLara captures, structures, and holds what gets explored together —
          so the insight from a session doesn&apos;t evaporate when it ends.
          Camp CLAI is the first stream on the platform.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-full bg-forest px-6 py-3 text-sm font-medium text-paper shadow-soft transition-colors hover:bg-forest-deep"
          >
            Login with CL Account
          </Link>
        </div>

        <div className="mt-8 grid w-full gap-4 rounded-lg border border-cloud bg-paper p-6 text-left shadow-soft sm:grid-cols-3">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-wide text-horizon">
              Add
            </p>
            <p className="mt-1 text-sm text-ink/70">
              Chat, Record, and Upload bring thinking into the Commons.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-wide text-horizon">
              Commons
            </p>
            <p className="mt-1 text-sm text-ink/70">
              Structured, stream-scoped Markdown with shared metadata.
            </p>
          </div>
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-wide text-horizon">
              Synthesis
            </p>
            <p className="mt-1 text-sm text-ink/70">
              Ask CLara, the Knowledge Map, and Top 10 surface what was found.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
