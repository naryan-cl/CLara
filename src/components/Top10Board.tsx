"use client";

import Link from "next/link";
import { useState } from "react";
import { FadeRise } from "@/components/motion/FadeRise";
import type { Top10Board, Top10Item, Top10Source } from "@/lib/top10";

const PREVIEW_SOURCES = 3;

type ColumnId = "topics" | "differences" | "questions";

const COLUMNS: {
  id: ColumnId;
  title: string;
  blurb: string;
  empty: string;
  countLabel: (n: number) => string;
}[] = [
  {
    id: "topics",
    title: "What’s humming",
    blurb:
      "Ideas nearest the centre of the Knowledge Map — then how often they show up in Public Commons.",
    empty:
      "No topics yet. Public reflections, recordings, and uploads grow this list as their tags and summaries land.",
    countLabel: (n) => (n === 1 ? "1 place" : `${n} places`),
  },
  {
    id: "differences",
    title: "Spaces of difference",
    blurb:
      "Tensions and polarities the stream is holding, ordered by how central those ideas are on the map. Difference is data.",
    empty:
      "No named tensions yet. Either the stream is unusually aligned, or summaries haven’t had polarities to report.",
    countLabel: (n) => (n === 1 ? "held in 1 place" : `held in ${n} places`),
  },
  {
    id: "questions",
    title: "Still asking",
    blurb:
      "Questions people actually asked, plus session inquiries — ordered by closeness when the idea sits on the Knowledge Map.",
    empty:
      "No questions harvested yet. Session inquiries and “Key questions” in summaries will appear here.",
    countLabel: (n) => (n === 1 ? "asked in 1 place" : `asked in ${n} places`),
  },
];

/**
 * Three ranked lists with source chips back to the original Commons item.
 * Client-only for phone tabs + “more sources” expand — ranking already happened
 * on the server.
 */
export function Top10BoardView({ board }: { board: Top10Board }) {
  const [tab, setTab] = useState<ColumnId>("topics");
  const lists: Record<ColumnId, Top10Item[]> = {
    topics: board.topics,
    differences: board.differences,
    questions: board.questions,
  };
  const totalItems =
    board.topics.length + board.differences.length + board.questions.length;

  if (totalItems === 0) {
    return (
      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft sm:p-8">
        <p className="font-display text-xl font-medium italic text-ink">
          A quiet meadow, for now.
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">
          Top 10 grows from Public Commons — tags, element summaries, session
          inquiries, and Knowledge Map links — then orders them by closeness
          (how central an idea is on the map). Add something Public, wait
          for its summary, and this page will start to hum.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/add/chat"
            className="rounded-pill bg-forest px-4 py-2 text-sm font-medium text-paper"
          >
            Reflect
          </Link>
          <Link
            href="/add/record"
            className="rounded-pill border border-cloud px-4 py-2 text-sm text-ink/80 hover:border-sage/50"
          >
            Record
          </Link>
          <Link
            href="/add/upload"
            className="rounded-pill border border-cloud px-4 py-2 text-sm text-ink/80 hover:border-sage/50"
          >
            Upload
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex gap-2 lg:hidden"
        role="tablist"
        aria-label="Top 10 lists"
      >
        {COLUMNS.map((column) => {
          const count = lists[column.id].length;
          const selected = tab === column.id;
          return (
            <button
              key={column.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(column.id)}
              className={`min-h-11 flex-1 rounded-pill border px-3 py-2 text-xs font-medium ${
                selected
                  ? "border-forest bg-forest text-paper"
                  : "border-cloud bg-paper text-ink/70"
              }`}
            >
              {column.title}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = lists[column.id];
          return (
            <section
              key={column.id}
              className={column.id === tab ? "block" : "hidden lg:block"}
              aria-labelledby={`top10-${column.id}`}
            >
              <h2
                id={`top10-${column.id}`}
                className="font-display text-2xl font-medium text-ink"
              >
                {column.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">{column.blurb}</p>

              {items.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-cloud bg-paper/80 p-4 text-sm leading-6 text-ink/55">
                  {column.empty}
                </p>
              ) : (
                <ol className="mt-5 flex flex-col gap-3">
                  {items.map((item, index) => (
                    <FadeRise
                      key={`${column.id}-${item.rank}-${item.label}`}
                      as="li"
                      staggerDelayMs={Math.min(index, 6) * 40}
                    >
                      <Top10Card
                        item={item}
                        countLabel={column.countLabel(item.mentionCount)}
                      />
                    </FadeRise>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Top10Card({
  item,
  countLabel,
}: {
  item: Top10Item;
  countLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const hidden = item.sources.length - PREVIEW_SOURCES;
  const shown = expanded ? item.sources : item.sources.slice(0, PREVIEW_SOURCES);
  const isLead = item.rank === 1;
  const evidence = item.evidenceSnippet ?? item.detail;

  return (
    <article
      className={`rounded-lg border bg-paper p-4 shadow-soft ${
        isLead
          ? "border-glow/50 ring-1 ring-glow/25"
          : "border-cloud"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`font-display text-2xl font-medium italic leading-none ${
            isLead ? "text-forest" : "text-ink/30"
          }`}
          aria-hidden="true"
        >
          {String(item.rank).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="font-display text-lg font-medium leading-snug text-ink"
            onMouseEnter={() => evidence && setShowEvidence(true)}
            onMouseLeave={() => setShowEvidence(false)}
            onFocus={() => evidence && setShowEvidence(true)}
            onBlur={() => setShowEvidence(false)}
            tabIndex={evidence ? 0 : undefined}
            title={evidence ?? undefined}
          >
            {item.label}
          </h3>
          {item.detail ? (
            <p className="mt-1 text-sm leading-6 text-ink/60">{item.detail}</p>
          ) : null}
          {showEvidence && evidence && evidence !== item.detail ? (
            <p className="mt-2 rounded border border-cloud bg-sand/70 px-2 py-1.5 text-xs leading-5 text-ink/65">
              {evidence}
            </p>
          ) : null}
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-sage">
            {countLabel}
          </p>
        </div>
      </div>

      {item.sources.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-cloud pt-3">
          {shown.map((source) => (
            <SourceChip key={`${source.kind}-${source.id}`} source={source} />
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-pill border border-dashed border-cloud px-3 py-1 font-mono text-[11px] text-ink/55 hover:border-sage/50 hover:text-ink"
            >
              {expanded ? "Show fewer" : `+${hidden} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SourceChip({ source }: { source: Top10Source }) {
  return (
    <Link
      href={source.href}
      className="max-w-full truncate rounded-pill border border-horizon/40 bg-sand/60 px-3 py-1 font-mono text-[11px] text-horizon transition-[border-color,transform] duration-[var(--duration-ui)] ease-[var(--ease)] hover:border-horizon hover:-translate-y-px"
      title={source.title}
    >
      {source.typeLabel ? `${source.typeLabel} · ` : ""}
      {source.title}
    </Link>
  );
}
