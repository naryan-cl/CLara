"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";

const MAP_SENTINEL = "<!-- synthesis-map -->";

type PreliminarySynthesisProps = {
  markdown: string;
  isDraftPreview?: boolean;
  mapSrc?: string;
};

type HeadingTone = {
  text: string;
  bar: string;
  soft: string;
  quote: string;
};

const HEADING_TONES: HeadingTone[] = [
  {
    text: "text-forest",
    bar: "bg-forest",
    soft: "bg-forest/10",
    quote: "border-forest bg-forest/5",
  },
  {
    text: "text-horizon",
    bar: "bg-horizon",
    soft: "bg-horizon/10",
    quote: "border-horizon bg-horizon/5",
  },
  {
    text: "text-ember",
    bar: "bg-ember",
    soft: "bg-ember/10",
    quote: "border-ember bg-ember/5",
  },
  {
    text: "text-success",
    bar: "bg-success",
    soft: "bg-success/10",
    quote: "border-success bg-success/5",
  },
];

const SECTION_LABELS = new Set([
  "insights",
  "conflicting perspectives",
  "key quotes",
  "sessions",
]);

function toneForTitle(title: string): HeadingTone {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash + title.charCodeAt(i) * (i + 1)) % HEADING_TONES.length;
  }
  return HEADING_TONES[hash] ?? HEADING_TONES[0];
}

function plainText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return plainText(props?.children);
  }
  return "";
}

function isSectionLabel(children: ReactNode): string | null {
  const text = plainText(children).trim().replace(/:$/, "");
  if (!text) return null;
  if (SECTION_LABELS.has(text.toLowerCase())) return text;
  return null;
}

function isSessionsLine(children: ReactNode): boolean {
  return /^sessions\s*:/i.test(plainText(children).trim());
}

function splitMarkdownAtMap(markdown: string): { beforeMap: string; afterMap: string } {
  const idx = markdown.indexOf(MAP_SENTINEL);
  if (idx < 0) {
    return { beforeMap: markdown, afterMap: "" };
  }
  const beforeMap = markdown.slice(0, idx).trimEnd();
  const afterMap = markdown.slice(idx + MAP_SENTINEL.length).trimStart();
  return { beforeMap, afterMap };
}

function GenerativeSystemMap({
  mapSrc,
  titleId,
}: {
  mapSrc: string;
  titleId: string;
}) {
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  useEffect(() => {
    if (!isMapFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMapFullscreen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMapFullscreen]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={titleId}
            className="font-display text-2xl font-medium text-ink"
          >
            Generative system map
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-ink/60">
            How CL human expertise, AI learning, infrastructure, and client value
            connect as a generative system — walking our walk as we learn together.
            Click a node for narrative, tensions, and Commons-backed quotes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsMapFullscreen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-cloud bg-paper px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider text-forest shadow-soft transition hover:border-sage"
        >
          {isMapFullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      <div
        className={
          isMapFullscreen
            ? "fixed inset-0 z-50 bg-sand p-3 sm:p-5"
            : "overflow-hidden rounded-lg border border-cloud bg-paper shadow-soft"
        }
      >
        {isMapFullscreen ? (
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setIsMapFullscreen(false)}
              className="rounded-lg border border-cloud bg-paper px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider text-forest shadow-soft"
            >
              Exit full screen
            </button>
          </div>
        ) : null}
        <iframe
          title="Generative system map"
          src={mapSrc}
          className={
            isMapFullscreen
              ? "h-[calc(100vh-3.5rem)] w-full rounded-lg border border-cloud bg-paper"
              : "h-[min(70vh,640px)] w-full border-0"
          }
        />
      </div>
    </section>
  );
}

export function PreliminarySynthesis({
  markdown,
  isDraftPreview,
  mapSrc = "/synthesis/map.html?embed=1",
}: PreliminarySynthesisProps) {
  const mapTitleId = useId();
  const { beforeMap, afterMap } = splitMarkdownAtMap(markdown);
  const hasMapSplit = markdown.includes(MAP_SENTINEL);

  let leadParagraphSeen = false;

  const markdownComponents: Components = {
    h1: () => null,
    h2: ({ children }) => {
      const title = plainText(children).trim();
      const tone = toneForTitle(title);
      return (
        <h2
          className={`group mt-14 scroll-mt-24 font-display text-2xl font-medium tracking-tight first:mt-0 md:text-[1.7rem] ${tone.text}`}
        >
          <span className="inline-flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-2 h-8 w-1.5 shrink-0 rounded-full ${tone.bar}`}
            />
            <span className="min-w-0">{children}</span>
          </span>
        </h2>
      );
    },
    h3: ({ children }) => (
      <h3 className="mt-8 font-display text-lg font-medium text-ink md:text-xl">
        {children}
      </h3>
    ),
    p: ({ children }) => {
      const label = isSectionLabel(children);
      if (label) {
        const tone = toneForTitle(label);
        return (
          <div className="mt-9 mb-3">
            <p
              className={`inline-flex rounded-full border border-cloud px-3 py-1 font-mono text-[0.7rem] font-medium uppercase tracking-[0.12em] ${tone.soft} ${tone.text}`}
            >
              {label}
            </p>
          </div>
        );
      }

      if (isSessionsLine(children)) {
        const text = plainText(children);
        const value = text.replace(/^sessions\s*:\s*/i, "");
        return (
          <p className="mt-6 rounded-lg border border-dashed border-cloud bg-paper/60 px-4 py-3 text-sm leading-relaxed text-ink/60">
            <span className="mr-2 font-mono text-xs font-medium uppercase tracking-widest text-ink">
              Sessions
            </span>
            {value}
          </p>
        );
      }

      const text = plainText(children).trim();
      if (/^generated:/i.test(text)) {
        return (
          <p className="mt-3 max-w-3xl text-sm font-medium tracking-wide text-ink/55">
            {children}
          </p>
        );
      }

      const isLead = !leadParagraphSeen;
      leadParagraphSeen = true;

      return (
        <p
          className={
            isLead
              ? "mt-0 max-w-3xl text-lg font-medium leading-8 text-ink md:text-xl md:leading-9"
              : "mt-4 max-w-3xl text-[1.05rem] leading-8 text-ink/90"
          }
        >
          {children}
        </p>
      );
    },
    strong: ({ children }) => (
      <strong className="font-semibold text-ink">{children}</strong>
    ),
    ul: ({ children }) => (
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-[1.05rem] leading-7 text-ink/90">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mt-3 max-w-3xl list-decimal space-y-2 pl-5 text-[1.05rem] leading-7 text-ink/90">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => {
      const tone = toneForTitle(plainText(children).slice(0, 24));
      return (
        <blockquote
          className={`mt-4 max-w-3xl border-l-4 py-2 pl-4 pr-3 text-[1.02rem] leading-7 text-ink/85 ${tone.quote}`}
        >
          {children}
        </blockquote>
      );
    },
    hr: () => <hr className="my-12 border-cloud" />,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-horizon underline decoration-horizon/30 underline-offset-2 hover:decoration-horizon"
      >
        {children}
      </a>
    ),
  };

  const themeMarkdownComponents: Components = {
    ...markdownComponents,
    p: ({ children }) => {
      const label = isSectionLabel(children);
      if (label) {
        const tone = toneForTitle(label);
        return (
          <div className="mt-9 mb-3">
            <p
              className={`inline-flex rounded-full border border-cloud px-3 py-1 font-mono text-[0.7rem] font-medium uppercase tracking-[0.12em] ${tone.soft} ${tone.text}`}
            >
              {label}
            </p>
          </div>
        );
      }

      if (isSessionsLine(children)) {
        const text = plainText(children);
        const value = text.replace(/^sessions\s*:\s*/i, "");
        return (
          <p className="mt-6 rounded-lg border border-dashed border-cloud bg-paper/60 px-4 py-3 text-sm leading-relaxed text-ink/60">
            <span className="mr-2 font-mono text-xs font-medium uppercase tracking-widest text-ink">
              Sessions
            </span>
            {value}
          </p>
        );
      }

      return (
        <p className="mt-4 max-w-3xl text-[1.05rem] leading-8 text-ink/90">
          {children}
        </p>
      );
    },
  };

  return (
    <div className="flex flex-col gap-12">
      {isDraftPreview ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink">
          Admin draft preview — not published to all participants yet.
        </div>
      ) : null}

      <article className="min-w-0">
        <ReactMarkdown components={markdownComponents}>{beforeMap}</ReactMarkdown>
      </article>

      {hasMapSplit ? (
        <GenerativeSystemMap mapSrc={mapSrc} titleId={mapTitleId} />
      ) : null}

      {afterMap ? (
        <article className="min-w-0">
          <ReactMarkdown components={themeMarkdownComponents}>
            {afterMap}
          </ReactMarkdown>
        </article>
      ) : null}
    </div>
  );
}
