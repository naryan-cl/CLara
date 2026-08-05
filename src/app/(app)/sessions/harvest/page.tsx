import Link from "next/link";
import { DocumentList } from "@/components/DocumentList";
import { HarvestExport } from "@/components/HarvestExport";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listSessions } from "@/lib/sessions/list-sessions";
import { listAttendedSessionIds } from "@/lib/sessions/attendance";
import { listDocumentsBySession } from "@/lib/documents/list-by-session";
import { createClient } from "@/lib/supabase/server";
import type { CommonsDocument } from "@/lib/documents/types";
import type { SessionSummary } from "@/lib/sessions/types";

export default async function HarvestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { stream } = await getActiveStream();

  if (!user || !stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">Sign in to see your harvest.</p>
      </div>
    );
  }

  const { sessions: allSessions } = await listSessions(stream.id);
  const { sessionIds: attendedIds } = await listAttendedSessionIds(
    user.id,
    stream.id,
  );
  const attendedIdSet = new Set(attendedIds);
  const attendedSessions = allSessions.filter((s) => attendedIdSet.has(s.id));

  const sessionsWithDocs: { session: SessionSummary; documents: CommonsDocument[] }[] =
    await Promise.all(
      attendedSessions.map(async (session) => {
        const { documents } = await listDocumentsBySession(session.id);
        return { session, documents };
      }),
    );

  const totalDocuments = sessionsWithDocs.reduce(
    (sum, s) => sum + s.documents.length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/commons" className="text-sm text-horizon hover:underline">
        ← Back to Commons
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">
            My harvest
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Every Commons document from sessions you&apos;ve marked
            &quot;I attended&quot;. Mark attendance from a session&apos;s page
            in the{" "}
            <Link href="/sessions/archive" className="underline">
              session archive
            </Link>
            .
          </p>
        </div>
        {totalDocuments > 0 ? (
          <HarvestExport
            sessions={sessionsWithDocs.map(({ session, documents }) => ({
              name: session.name,
              documents: documents.map((d) => ({
                title: d.title,
                content: d.content,
              })),
            }))}
          />
        ) : null}
      </div>

      {sessionsWithDocs.length === 0 ? (
        <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/60">
            You haven&apos;t marked any sessions attended yet.
          </p>
        </section>
      ) : (
        sessionsWithDocs.map(({ session, documents }) => (
          <section
            key={session.id}
            className="rounded-lg border border-cloud bg-paper p-6 shadow-soft"
          >
            <h2 className="font-display text-lg font-medium text-ink">
              <Link
                href={`/sessions/archive/${session.id}`}
                className="hover:text-forest hover:underline"
              >
                {session.name}
              </Link>
            </h2>
            {documents.length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">
                No Commons documents tied to this session yet.
              </p>
            ) : (
              <div className="mt-4">
                <DocumentList documents={documents} />
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
