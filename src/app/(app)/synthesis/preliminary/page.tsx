import { PreliminarySynthesis } from "@/components/synthesis/PreliminarySynthesis";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import {
  getPreliminarySynthesisMarkdown,
  isPreliminarySynthesisPublished,
  shouldShowPreliminarySynthesis,
} from "@/lib/synthesis/preliminary-synthesis";

export const metadata = {
  title: "Naryan and Gayle's Synthesis — CLara",
  description:
    "Camp CLAI synthesis combining Gayle's grounded experience, Naryan's systems thinking, and AI pattern-finding across the commons.",
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
          Naryan and Gayle&apos;s Synthesis
        </h1>
      </div>

      {!stream ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to open Naryan and Gayle&apos;s Synthesis.
          </p>
        </div>
      ) : !canView || !markdown ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Naryan and Gayle&apos;s Synthesis is not available yet.
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
