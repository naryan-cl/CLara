import { AskForm } from "@/components/AskForm";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function AskPage() {
  const { stream } = await getActiveStream();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Ask CLara
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Query the {stream?.name ?? "Camp CLAI"} Commons and get answers
          grounded in real transcripts and summaries, with source links back
          to the originating document. Follow-up questions stay in this thread
          (still separate from Add → Chat).
        </p>
      </div>

      {stream ? (
        <AskForm />
      ) : (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to ask CLara about its Commons.
          </p>
        </div>
      )}
    </div>
  );
}
