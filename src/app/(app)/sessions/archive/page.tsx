import Link from "next/link";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listSessions } from "@/lib/sessions/list-sessions";

export default async function SessionArchivePage() {
  const { stream } = await getActiveStream();
  const { sessions } = stream
    ? await listSessions(stream.id)
    : { sessions: [] };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/commons" className="text-sm text-horizon hover:underline">
        ← Back to Commons
      </Link>

      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Session archive
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Every session (event) this stream has captured Commons documents
          for. Open one to see everything tied to it.
        </p>
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        {sessions.length === 0 ? (
          <p className="text-sm text-ink/60">
            No sessions yet. Sessions are created from a document&apos;s
            editor — open a document, edit it, and pick &quot;+ New
            session…&quot;.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex min-w-0 items-baseline justify-between gap-4 border-b border-cloud pb-3 last:border-0 last:pb-0"
              >
                <Link
                  href={`/sessions/archive/${session.id}`}
                  className="min-w-0 flex-1 truncate font-medium text-ink hover:text-forest hover:underline"
                >
                  {session.name}
                </Link>
                <time className="shrink-0 font-mono text-[11px] text-ink/40">
                  {session.occurred_at
                    ? new Date(session.occurred_at).toLocaleDateString()
                    : new Date(session.created_at).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
