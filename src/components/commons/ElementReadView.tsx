"use client";

import Link from "next/link";
import { ContentTabs } from "@/components/commons/ContentTabs";
import { MarkdownView } from "@/components/MarkdownView";
import type { DetailPayload } from "@/app/(app)/commons/actions";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  hasSummaryText,
  mergeAttendeeNames,
  needsElementSummary,
  sourceTabLabel,
} from "@/lib/documents/summary";
import { stripListensJobMeta } from "@/lib/listens/job-meta";
import {
  isRecordingProcessing,
  recordingProcessLabel,
  recordingProcessStatus,
} from "@/lib/listens/process-status";
import { TranscriptRetryBar } from "@/components/TranscriptRetryBar";
import { ListensAudioPlayer } from "@/components/ListensAudioPlayer";

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function MetaPill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "live" | "danger";
}) {
  const toneClass =
    tone === "live"
      ? "border-horizon/50 text-horizon"
      : tone === "danger"
        ? "border-danger/40 text-danger"
        : "border-sage/40 text-sage";
  return (
    <span
      className={`rounded-pill border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

function PersonPills({ people }: { people: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {people.map((person) => (
        <li
          key={person}
          className="rounded-pill border border-cloud bg-sand/50 px-3 py-1 text-xs text-ink/80"
        >
          {person}
        </li>
      ))}
    </ul>
  );
}

function MetaField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
        {label}
      </h3>
      {children}
    </section>
  );
}

function summarizingCopy(type: string | null): string {
  if (type === "Transcript") {
    return "CLara is writing a summary of this transcript…";
  }
  if (type === "Reflection") {
    return "CLara is writing a summary of this reflection…";
  }
  return "CLara is writing a summary…";
}

export function DocumentReadView({
  document,
  createdByName,
  attendeeNames,
  hideTitle = false,
  canEdit = false,
}: {
  document: CommonsDocument;
  createdByName: string | null;
  attendeeNames: string[];
  hideTitle?: boolean;
  canEdit?: boolean;
}) {
  const okfParticipants = asStringList(document.participants);
  const attendees = mergeAttendeeNames(attendeeNames, okfParticipants);
  const tags = asStringList(document.tags);
  const date = formatDate(document.created_at);
  const processStatus = recordingProcessStatus(document);
  const processLabel = recordingProcessLabel(processStatus);
  const processTone =
    processStatus === "failed"
      ? "danger"
      : isRecordingProcessing(processStatus)
        ? "live"
        : "default";
  const awaitingSummary =
    needsElementSummary(document) || processStatus === "summarizing";
  const sourceLabel = sourceTabLabel(document.type);
  const isSynthesis = document.type === "Summary";

  const summaryTab = (
    <div>
      {awaitingSummary && !hasSummaryText(document.summary) ? (
        <p className="text-sm text-ink/55" aria-live="polite">
          {processStatus === "transcribing"
            ? "CLara is turning your audio into a transcript…"
            : summarizingCopy(document.type)}
        </p>
      ) : hasSummaryText(document.summary) ? (
        <MarkdownView markdown={document.summary ?? ""} />
      ) : isSynthesis ? (
        <MarkdownView
          markdown={document.content}
          emptyLabel="No summary yet."
        />
      ) : (
        <p className="text-sm text-ink/55">
          No summary yet. Open the {sourceLabel} tab for the original.
        </p>
      )}
    </div>
  );

  const sourceTab = (
    <MarkdownView
      markdown={stripListensJobMeta(document.content)}
      emptyLabel={`No ${sourceLabel.toLowerCase()} yet.`}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill>{document.type ?? "Document"}</MetaPill>
          {document.privacy_status === "private" ? (
            <MetaPill>Private</MetaPill>
          ) : null}
          {processLabel ? (
            <MetaPill tone={processTone}>{processLabel}</MetaPill>
          ) : null}
        </div>
        {!hideTitle ? (
          <h2 className="font-display text-xl font-medium text-ink">
            {document.title?.trim() || "Untitled"}
          </h2>
        ) : null}
        {date ? (
          <p className="font-mono text-[11px] tracking-wide text-ink/45">
            {date}
          </p>
        ) : null}
      </header>

      {createdByName ? (
        <MetaField label="Created by">
          <p className="text-sm text-ink/80">{createdByName}</p>
        </MetaField>
      ) : null}

      {document.type === "Transcript" ? (
        <div className="flex flex-col gap-3">
          <TranscriptRetryBar document={document} canEdit={canEdit} />
          <ListensAudioPlayer
            documentId={document.id}
            content={document.content}
          />
        </div>
      ) : null}

      {attendees.length >= 2 ? (
        <MetaField label="Attendees">
          <PersonPills people={attendees} />
        </MetaField>
      ) : null}

      {tags.length > 0 ? (
        <MetaField label="Tags">
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-pill border border-horizon/30 px-2.5 py-0.5 font-mono text-[10px] text-horizon"
              >
                #{tag}
              </li>
            ))}
          </ul>
        </MetaField>
      ) : null}

      <div className="border-t border-cloud pt-4">
        <ContentTabs
          defaultTabId="summary"
          tabs={
            isSynthesis
              ? [{ id: "summary", label: "Summary", content: summaryTab }]
              : [
                  { id: "summary", label: "Summary", content: summaryTab },
                  { id: "source", label: sourceLabel, content: sourceTab },
                ]
          }
        />
      </div>
    </div>
  );
}

function sessionSummaryMarkdown(
  detail: Extract<DetailPayload, { kind: "session" }>,
): string {
  const synthesisId = detail.session.synthesis_document_id;
  const synthesis =
    detail.documents.find((doc) => doc.id === synthesisId) ??
    detail.documents.find((doc) => doc.type === "Summary");
  if (synthesis?.content?.trim()) {
    return synthesis.content;
  }

  const childBits = detail.documents
    .filter((doc) => doc.type !== "Summary")
    .map((doc) => {
      const body = doc.summary?.trim();
      if (!body) return null;
      const heading = doc.title?.trim() || doc.type || "Contribution";
      return `### ${heading}\n\n${body}`;
    })
    .filter((bit): bit is string => Boolean(bit));

  return childBits.join("\n\n");
}

export function SessionSummaryTabs({
  detail,
}: {
  detail: Extract<DetailPayload, { kind: "session" }>;
}) {
  const contributions = detail.documents.filter(
    (doc) => doc.type !== "Summary",
  );
  const summaryMarkdown = sessionSummaryMarkdown(detail);

  return (
    <ContentTabs
      defaultTabId="summary"
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: summaryMarkdown ? (
            <MarkdownView markdown={summaryMarkdown} />
          ) : (
            <p className="text-sm text-ink/55">
              A gathering summary appears as contributions land, or when the
              host finalizes this session.
            </p>
          ),
        },
        {
          id: "contributions",
          label: "Contributions",
          content:
            contributions.length === 0 ? (
              <p className="text-sm text-ink/50">
                No Commons documents are linked to this session yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {contributions.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/sessions/documents/${doc.id}`}
                      className="text-sm text-horizon hover:underline"
                    >
                      {doc.title?.trim() || "Untitled"}
                    </Link>
                    <span className="ml-2 font-mono text-[11px] text-ink/40">
                      {doc.type ?? "Document"}
                    </span>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
    />
  );
}

export function SessionReadView({
  detail,
  hideTitle = false,
}: {
  detail: Extract<DetailPayload, { kind: "session" }>;
  hideTitle?: boolean;
}) {
  const date = formatDate(
    detail.session.occurred_at ?? detail.session.created_at,
  );
  const attendeeNames = detail.attendees.map((person) => person.display_name);
  const createdByName = detail.createdBy?.display_name ?? null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill>Session</MetaPill>
          {detail.attending ? <MetaPill>Attending</MetaPill> : null}
          {detail.session.finalized_at ? <MetaPill>Finalized</MetaPill> : null}
        </div>
        {!hideTitle ? (
          <h2 className="font-display text-xl font-medium text-ink">
            {detail.session.name}
          </h2>
        ) : null}
        {date ? (
          <p className="font-mono text-[11px] tracking-wide text-ink/45">
            {date}
          </p>
        ) : null}
      </header>

      {createdByName ? (
        <MetaField label="Created by">
          <p className="text-sm text-ink/80">{createdByName}</p>
        </MetaField>
      ) : null}

      {detail.session.join_code ? (
        <MetaField label="Join code">
          <p className="font-mono text-sm tracking-widest text-ink">
            {detail.session.join_code}
          </p>
          <Link
            href={`/add/session?id=${detail.session.id}`}
            className="text-sm text-horizon hover:underline"
          >
            Open live board (share links & QR)
          </Link>
        </MetaField>
      ) : null}

      {attendeeNames.length >= 2 ? (
        <MetaField label="Attendees">
          <PersonPills people={attendeeNames} />
        </MetaField>
      ) : null}

      {detail.session.seed_question ? (
        <section className="flex flex-col gap-1 rounded-md border border-horizon/20 bg-sand/40 px-4 py-3">
          <h3 className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            Inquiry
          </h3>
          <p className="text-sm leading-6 text-ink/80">
            {detail.session.seed_question}
          </p>
        </section>
      ) : null}

      {detail.session.description ? (
        <MetaField label="Description">
          <p className="text-sm leading-6 text-ink/70">
            {detail.session.description}
          </p>
        </MetaField>
      ) : null}

      <div className="border-t border-cloud pt-4">
        <SessionSummaryTabs detail={detail} />
      </div>
    </div>
  );
}
