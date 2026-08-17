import Link from "next/link";
import { Top10BoardView } from "@/components/Top10Board";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { buildStreamTop10 } from "@/lib/top10";

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
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-horizon">
          Synthesis · Top 10
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink sm:text-4xl">
          A live reading of the Commons
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/60">
          Top topics, spaces of difference, and questions still in the air
          across {stream?.name ?? "this stream"} — ranked by how often they
          show up in Public material. Every chip is a door back to the
          original voice. Private stays private, same as the Knowledge Map.
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
            Ranked from Public, non-draft Commons (OKF tags, element-summary
            theme tags / tensions / key questions), session inquiries, and
            Knowledge Map contrast links. Not an Ask CLara answer — this is a
            count of what people already wrote.{" "}
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
