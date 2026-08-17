import Link from "next/link";
import { Top10BoardView } from "@/components/Top10Board";
import { HelpTip } from "@/components/HelpTip";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { buildStreamTop10 } from "@/lib/top10";
import { CLOSENESS_GLOSSARY } from "@/lib/graph/closeness";

export const metadata = {
  title: "Top 10 — CLara",
  description:
    "Top topics, spaces of difference, and questions from the stream Commons.",
};

export default async function Top10Page() {
  const { stream } = await getActiveStream();
  const { board, error } = stream
    ? await buildStreamTop10(stream.id)
    : { board: null, error: null };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-3xl font-medium text-ink sm:text-4xl">
          A live reading of the Commons
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
          Top topics, spaces of difference, and questions still in the air
          across {stream?.name ?? "this stream"} — ordered by{" "}
          <HelpTip
            variant="term"
            label="closeness"
            description={CLOSENESS_GLOSSARY}
            placement="bottom"
          />{" "}
          on the Knowledge Map (how central an idea is), then by how often they
          show up. Every chip is a door back to the original voice. Private
          stays private, same as the Knowledge Map.
        </p>
      </div>

      {!stream ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to see its Top 10.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
          <p className="font-mono text-sm text-danger">{error}</p>
        </div>
      ) : board ? (
        <>
          <Top10BoardView board={board} />
          <p className="max-w-2xl text-xs leading-5 text-ink/45">
            Ordered by closeness on the Knowledge Map (same SNA measure as
            circle size on /map), then by how often the idea appears in Public
            Commons. Ideas that never landed on the map sort after those that
            did. Not an Ask CLara answer — this is a reading of what people
            already wrote.{" "}
            <Link href="/ask" className="text-horizon hover:underline">
              Curious about one of these? Ask CLara
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}
