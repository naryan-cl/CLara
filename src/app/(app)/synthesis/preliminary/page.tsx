import { PreliminarySynthesis } from "@/components/synthesis/PreliminarySynthesis";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import {
  getPreliminarySynthesisMarkdown,
  isPreliminarySynthesisPublished,
  shouldShowPreliminarySynthesis,
} from "@/lib/synthesis/preliminary-synthesis";

export const metadata = {
  title: "Preliminary Synthesis — CLara",
  description:
    "One-time Camp CLAI harvest reading through the organizer theme rubric.",
};

export default async function PreliminarySynthesisPage() {
  const { stream } = await getActiveStream();
  const isAdmin = stream?.role === "admin";
  const markdown = getPreliminarySynthesisMarkdown();
  const published = isPreliminarySynthesisPublished();
  const canView = shouldShowPreliminarySynthesis(Boolean(isAdmin));

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-horizon">
          Synthesis
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink sm:text-4xl">
          Preliminary Synthesis
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
          A festival-wide (stream-wide) reading of the Camp CLAI harvest through
          the organizer seed themes — separate from Ask CLara. Quotes are
          de-identified for organizers and participants.
        </p>
      </div>

      {!stream ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to open Preliminary Synthesis.
          </p>
        </div>
      ) : !canView || !markdown ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Preliminary Synthesis is not available yet.
          </p>
        </div>
      ) : (
        <PreliminarySynthesis
          markdown={markdown}
          isDraftPreview={!published && isAdmin}
        />
      )}
    </div>
  );
}
