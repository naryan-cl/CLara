import {
  isUnsummarizableContent,
} from "@/lib/documents/summary";
import { stripListensJobMeta } from "@/lib/listens/job-meta";

/** Which body field to pull from Commons documents for the download. */
export type ExportContentMode = "transcript" | "summary" | "structured";

export type ExportDocumentPayload = {
  id: string;
  title: string | null;
  type: string | null;
  content: string;
  summary: string | null;
  created_at: string;
  privacy_status: "public" | "private";
};

export type ExportSessionPayload = {
  id: string;
  name: string;
  occurred_at: string | null;
  created_at: string;
  seed_question: string | null;
  description: string | null;
  synthesis_document_id: string | null;
  documents: ExportDocumentPayload[];
};

/** Increase Markdown heading levels so nested summaries stay hierarchical. */
export function bumpMarkdownHeadings(markdown: string, extraLevels: number): string {
  if (extraLevels <= 0) return markdown;
  return markdown.replace(/^(#{1,6})\s/gm, (_, hashes: string) => {
    const next = Math.min(6, hashes.length + extraLevels);
    return `${"#".repeat(next)} `;
  });
}

export function formatExportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function documentTranscriptBody(
  doc: Pick<ExportDocumentPayload, "content">,
): string | null {
  if (isUnsummarizableContent(doc.content)) return null;
  const body = stripListensJobMeta(doc.content).trim();
  return body || null;
}

export function documentSummaryBody(doc: ExportDocumentPayload): string | null {
  if (doc.type === "Summary") {
    const body = doc.content.trim();
    return body || null;
  }
  const summary = doc.summary?.trim();
  return summary || null;
}

export function documentStructuredBody(doc: ExportDocumentPayload): string | null {
  const summary = documentSummaryBody(doc);
  if (summary) return summary;
  return documentTranscriptBody(doc);
}

export function documentHasExportContent(
  doc: ExportDocumentPayload,
  mode: ExportContentMode,
): boolean {
  if (mode === "transcript") {
    return Boolean(documentTranscriptBody(doc));
  }
  if (mode === "structured") {
    return Boolean(documentStructuredBody(doc));
  }
  return Boolean(documentSummaryBody(doc));
}

/** Mirrors session summary tab logic in ElementReadView. */
export function sessionSummaryBody(session: ExportSessionPayload): string | null {
  const synthesisId = session.synthesis_document_id;
  const synthesis =
    session.documents.find((doc) => doc.id === synthesisId) ??
    session.documents.find((doc) => doc.type === "Summary");
  if (synthesis?.content?.trim()) {
    return synthesis.content.trim();
  }

  const childBits = session.documents
    .filter((doc) => doc.type !== "Summary")
    .map((doc) => {
      const body = doc.summary?.trim();
      if (!body) return null;
      const heading = doc.title?.trim() || doc.type || "Contribution";
      return `### ${heading}\n\n${body}`;
    })
    .filter((bit): bit is string => Boolean(bit));

  if (childBits.length === 0) return null;
  return childBits.join("\n\n");
}

export function sessionStructuredBody(
  session: ExportSessionPayload,
): string | null {
  const parts: string[] = [];

  if (session.seed_question?.trim()) {
    parts.push(`## Inquiry\n\n${session.seed_question.trim()}`);
  }
  if (session.description?.trim()) {
    parts.push(`## Description\n\n${session.description.trim()}`);
  }

  const synthesisId = session.synthesis_document_id;
  const synthesis =
    session.documents.find((doc) => doc.id === synthesisId) ??
    session.documents.find((doc) => doc.type === "Summary");
  if (synthesis?.content?.trim()) {
    parts.push(`## Gathering synthesis\n\n${synthesis.content.trim()}`);
  }

  const children = session.documents.filter((doc) => doc.type !== "Summary");
  if (children.length > 0) {
    const childSections = children
      .map((doc) => {
        const body = documentStructuredBody(doc);
        if (!body) return null;
        const heading = doc.title?.trim() || doc.type || "Contribution";
        const typeLabel = doc.type ?? "Document";
        const nested = bumpMarkdownHeadings(body, 1);
        return `### ${heading} (${typeLabel})\n\n${nested}`;
      })
      .filter((section): section is string => Boolean(section));

    if (childSections.length > 0) {
      parts.push(`## Contributions\n\n${childSections.join("\n\n")}`);
    }
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

export function sessionTranscriptBody(
  session: ExportSessionPayload,
): string | null {
  const sections = session.documents
    .filter((doc) => doc.type !== "Summary")
    .map((doc) => {
      const body = documentTranscriptBody(doc);
      if (!body) return null;
      const heading = doc.title?.trim() || doc.type || "Contribution";
      return `## ${heading}\n\n${body}`;
    })
    .filter((section): section is string => Boolean(section));

  if (sections.length === 0) return null;
  return sections.join("\n\n");
}

export function sessionBodyForMode(
  session: ExportSessionPayload,
  mode: ExportContentMode,
): string | null {
  if (mode === "transcript") return sessionTranscriptBody(session);
  if (mode === "structured") return sessionStructuredBody(session);
  return sessionSummaryBody(session);
}

export function sessionHasExportContent(
  session: ExportSessionPayload,
  mode: ExportContentMode,
): boolean {
  return Boolean(sessionBodyForMode(session, mode));
}

export function documentBodyForMode(
  doc: ExportDocumentPayload,
  mode: ExportContentMode,
): string | null {
  if (mode === "transcript") return documentTranscriptBody(doc);
  if (mode === "structured") return documentStructuredBody(doc);
  return documentSummaryBody(doc);
}

export function formatDocumentExportSection(
  doc: ExportDocumentPayload,
  mode: ExportContentMode,
): string | null {
  const body = documentBodyForMode(doc, mode);
  if (!body) return null;

  const title = doc.title?.trim() || "Untitled";
  const date = formatExportDate(doc.created_at);
  const typeLabel = doc.type ?? "Document";
  const privacyNote =
    doc.privacy_status === "private" ? " · Private" : "";

  return `# ${title}\n\n_${typeLabel} · ${date}${privacyNote}_\n\n${body}\n\n---\n`;
}

export function formatSessionExportSection(
  session: ExportSessionPayload,
  mode: ExportContentMode,
): string | null {
  const body = sessionBodyForMode(session, mode);
  if (!body) return null;

  const title = session.name.trim() || "Untitled session";
  const date = formatExportDate(session.occurred_at ?? session.created_at);
  const meta: string[] = [`Session · ${date}`];
  if (session.seed_question?.trim()) {
    meta.push(`Inquiry: ${session.seed_question.trim()}`);
  }

  return `# ${title}\n\n_${meta.join(" · ")}_\n\n${body}\n\n---\n`;
}

export function buildExportMarkdown(sections: string[]): string {
  if (sections.length === 0) return "";
  return `${sections.join("\n")}\n`;
}

export function exportFilename(
  streamSlug: string,
  mode: ExportContentMode,
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${streamSlug}-${mode}-export-${stamp}.md`;
}

export function exportModeLabel(mode: ExportContentMode): string {
  switch (mode) {
    case "transcript":
      return "transcripts";
    case "summary":
      return "summaries";
    case "structured":
      return "structured";
  }
}
