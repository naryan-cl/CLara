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
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Commons</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Everything contributed to {stream?.name ?? "this stream"} — chats,
          recordings, uploads, and sessions. Click an item to open a detail
          popup (edit, attend, comment).
        </p>
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
            <span className="font-mono">0013_fix_document_sessions_rls.sql</span>
            . On <span className="font-mono">sessions</span> (often while
            deleting), run{" "}
            <span className="font-mono">0029_fix_session_delete_rls.sql</span>
            . If it mentions missing tables (comments / profiles), run{" "}
            <span className="font-mono">0011_comments_and_attendee_edit.sql</span>
            . If it mentions a missing <span className="font-mono">summary</span>{" "}
            column, run{" "}
            <span className="font-mono">0028_document_summary.sql</span>.
          </p>
        </section>
      ) : (
        <CommonsRepository items={items} currentUserId={user.id} />
      )}
    </div>
  );
}
