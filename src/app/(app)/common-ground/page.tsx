import { CommonGroundPanel } from "@/components/CommonGroundPanel";
import { HelpTip } from "@/components/HelpTip";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listSessions } from "@/lib/sessions/list-sessions";

export default async function CommonGroundPage() {
  const { stream } = await getActiveStream();
  const { sessions } = stream
    ? await listSessions(stream.id)
    : { sessions: [] };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Common Ground{" "}
          <HelpTip description="Synthesize multiple finalized gatherings into one report: shared themes, divergences, open questions, and suggested next inquiries. Galleries = sessions." />
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Select two or more Finalized sessions from {stream?.name ?? "your stream"}.
          CLara writes a cross-session Summary into the Commons — separate from
          Ask CLara and Top 10.
        </p>
      </div>

      {stream ? (
        <CommonGroundPanel sessions={sessions} />
      ) : (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to generate Common Ground reports.
          </p>
        </div>
      )}
    </div>
  );
}
