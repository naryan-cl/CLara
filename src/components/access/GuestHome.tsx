import Link from "next/link";
import type { GuestSession } from "@/lib/access/types";

export function GuestHome({ sessions }: { sessions: GuestSession[] }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 py-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-horizon">
          Session guest
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">
          Your sessions
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-ink/65">
          You have access only to the gatherings below — not the full Camp CLAI
          Commons. Reflect, Record, or Upload into a session you joined.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-lg border border-cloud bg-paper p-5 shadow-soft"
          >
            <p className="font-mono text-[11px] uppercase tracking-wide text-sage">
              {session.streamName}
            </p>
            <h2 className="mt-1 font-display text-xl font-medium text-ink">
              {session.name}
            </h2>
            {session.seed_question ? (
              <p className="mt-2 text-sm text-ink/60">{session.seed_question}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/add/chat?session=${session.id}`}
                className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-paper hover:bg-forest-deep"
              >
                Reflect
              </Link>
              <Link
                href={`/add/record?session=${session.id}`}
                className="rounded-full border border-cloud px-4 py-2 text-sm font-medium text-ink hover:border-sage/50"
              >
                Record
              </Link>
              <Link
                href={`/add/upload?session=${session.id}`}
                className="rounded-full border border-cloud px-4 py-2 text-sm font-medium text-ink hover:border-sage/50"
              >
                Upload
              </Link>
              <Link
                href={`/sessions/archive/${session.id}`}
                className="rounded-full border border-cloud px-4 py-2 text-sm font-medium text-horizon hover:border-horizon/40"
              >
                Open session
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
