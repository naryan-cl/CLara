import { ReceiveUploadForm } from "@/components/ReceiveUploadForm";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listRecentDocuments } from "@/lib/documents/list-recent";

export default async function SessionsPage() {
  const { stream } = await getActiveStream();
  const { documents } = stream
    ? await listRecentDocuments(stream.id, 10)
    : { documents: [] };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Sessions</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Add thinking to the Commons, then explore what landed. Full session
          archive and &quot;I Attended&quot; harvest come in a later slice —
          Receives (text) is first.
        </p>
      </div>

      <ReceiveUploadForm />

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Recent in this stream
        </h2>
        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">
            No documents yet. Upload a short <span className="font-mono">.md</span>{" "}
            or <span className="font-mono">.txt</span> above to test Receives.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
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
                  {new Date(doc.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
