import Link from "next/link";
import { CommonsRepository } from "@/components/CommonsRepository";
import { listCommonsItems } from "@/lib/commons/list-items";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function CommonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { stream } = await getActiveStream();
  const { items, error } =
    stream && user
      ? await listCommonsItems(stream.id, user.id)
      : { items: [], error: null };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Commons</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Everything contributed to {stream?.name ?? "this stream"} — chats,
            recordings, uploads, and sessions. Click an item to open a
            minimizable detail popup (edit, attend, comment).
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/sessions/harvest"
            className="rounded-md border border-cloud px-4 py-2 text-sm font-medium text-ink/70 hover:text-ink"
          >
            My harvest →
          </Link>
          <Link
            href="/add/upload"
            className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper"
          >
            Add something
          </Link>
        </div>
      </div>

      {!stream || !user ? (
        <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/60">
            Join a stream to browse its Commons.
          </p>
        </section>
      ) : error ? (
        <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="font-mono text-sm text-danger">{error}</p>
          <p className="mt-2 text-sm text-ink/60">
            If this mentions <span className="font-mono">infinite recursion</span>{" "}
            on <span className="font-mono">documents</span>, run migration{" "}
            <span className="font-mono">0013_fix_document_sessions_rls.sql</span>{" "}
            in the Supabase SQL editor. If it mentions missing tables (comments /
            profiles), run{" "}
            <span className="font-mono">0011_comments_and_attendee_edit.sql</span>.
          </p>
        </section>
      ) : (
        <CommonsRepository items={items} currentUserId={user.id} />
      )}
    </div>
  );
}
