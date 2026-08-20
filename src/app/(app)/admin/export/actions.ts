"use server";

import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_SELECT } from "@/lib/documents/columns";
import type { CommonsDocument } from "@/lib/documents/types";
import {
  buildExportMarkdown,
  formatDocumentExportSection,
  formatSessionExportSection,
  type ExportContentMode,
  type ExportDocumentPayload,
  type ExportSessionPayload,
} from "@/lib/commons/export";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { SESSION_SELECT, coerceSession } from "@/lib/sessions/types";

export type ExportCommonsResult =
  | { ok: true; markdown: string; exported: number; skipped: number }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; streamId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream || stream.role !== "admin") {
    return { ok: false, error: "Not authorized." };
  }

  return { ok: true, streamId: stream.id };
}

function toExportDocument(doc: CommonsDocument): ExportDocumentPayload {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    content: doc.content,
    summary: doc.summary ?? null,
    created_at: doc.created_at,
    privacy_status: doc.privacy_status,
  };
}

export async function exportCommonsSelection(input: {
  documentIds: string[];
  sessionIds: string[];
  mode: ExportContentMode;
}): Promise<ExportCommonsResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const documentIds = [...new Set(input.documentIds.filter(Boolean))];
  const sessionIds = [...new Set(input.sessionIds.filter(Boolean))];
  if (documentIds.length === 0 && sessionIds.length === 0) {
    return { ok: false, error: "Select at least one Commons element." };
  }

  const supabase = await createClient();
  const mode = input.mode;

  const [docsResult, sessionsResult] = await Promise.all([
    documentIds.length > 0
      ? supabase
          .from("documents")
          .select(DOCUMENT_SELECT)
          .eq("stream_id", auth.streamId)
          .in("id", documentIds)
          .eq("is_draft", false)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? supabase
          .from("sessions")
          .select(SESSION_SELECT)
          .eq("stream_id", auth.streamId)
          .in("id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (docsResult.error) {
    return { ok: false, error: docsResult.error.message };
  }
  if (sessionsResult.error) {
    return { ok: false, error: sessionsResult.error.message };
  }

  let sessionDocuments: CommonsDocument[] = [];
  if (sessionIds.length > 0) {
    const nested = await supabase
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("stream_id", auth.streamId)
      .in("session_id", sessionIds)
      .eq("is_draft", false)
      .order("created_at", { ascending: true });

    if (nested.error) {
      return { ok: false, error: nested.error.message };
    }
    sessionDocuments = (nested.data ?? []) as CommonsDocument[];
  }

  const docsBySession = new Map<string, ExportDocumentPayload[]>();
  for (const doc of sessionDocuments) {
    if (!doc.session_id) continue;
    const payload = toExportDocument(doc);
    const list = docsBySession.get(doc.session_id) ?? [];
    list.push(payload);
    docsBySession.set(doc.session_id, list);
  }

  const sections: string[] = [];
  let exported = 0;
  let skipped = 0;

  for (const id of documentIds) {
    const row = (docsResult.data ?? []).find((doc) => doc.id === id) as
      | CommonsDocument
      | undefined;
    if (!row || row.session_id) {
      skipped += 1;
      continue;
    }
    const section = formatDocumentExportSection(toExportDocument(row), mode);
    if (!section) {
      skipped += 1;
      continue;
    }
    sections.push(section);
    exported += 1;
  }

  for (const id of sessionIds) {
    const row = (sessionsResult.data ?? []).find((session) => session.id === id);
    if (!row) {
      skipped += 1;
      continue;
    }
    const session = coerceSession(row as Record<string, unknown>);
    const payload: ExportSessionPayload = {
      id: session.id,
      name: session.name,
      occurred_at: session.occurred_at,
      created_at: session.created_at,
      seed_question: session.seed_question,
      description: session.description,
      synthesis_document_id: session.synthesis_document_id,
      documents: docsBySession.get(session.id) ?? [],
    };
    const section = formatSessionExportSection(payload, mode);
    if (!section) {
      skipped += 1;
      continue;
    }
    sections.push(section);
    exported += 1;
  }

  if (exported === 0) {
    return {
      ok: false,
      error:
        mode === "summary"
          ? "Nothing to export — the selected items have no summaries yet."
          : "Nothing to export — the selected items have no transcript text yet.",
    };
  }

  return {
    ok: true,
    markdown: buildExportMarkdown(sections),
    exported,
    skipped,
  };
}
