/**
 * Export Camp CLAI Commons corpus for Preliminary Synthesis.
 *
 * Source materials ONLY: Transcript, Reflection, Note (uploads).
 * Excludes: Summary/synthesis docs, harvest briefs (doc.summary), is_external.
 *
 * Usage: node scripts/export-synthesis-corpus.mjs
 */
import path from "path";
import {
  createSynthesisClient,
  ensureDir,
  root,
  writeJson,
  writeText,
} from "./lib/synthesis-env.mjs";
import { deidentifyText, slugifySessionName } from "./lib/synthesis-deidentify.mjs";
import { extractInquiryList } from "./lib/synthesis-section-parser.mjs";

const STREAM_SLUG = process.env.SYNTHESIS_STREAM_SLUG?.trim() || "camp-clai";
const exportRoot = path.join(root, "synthesis/export");
const DOCUMENT_SELECT =
  "id, stream_id, created_by, content, summary, title, session_id, type, participants, tags, privacy_status, needs_review, is_draft, is_external, created_at, updated_at";

/** Commons source element types — not harvest briefs or graph/synthesis docs. */
const SOURCE_TYPES = new Set(["Transcript", "Reflection", "Note"]);

function isSourceDocument(doc) {
  if (doc.is_draft) return false;
  if (doc.is_external) return false;
  return SOURCE_TYPES.has(doc.type);
}

/** Raw participant-facing source text only — never harvest briefs. */
function sourceBody(doc) {
  return doc.content?.trim() || "";
}

function rosterFromDoc(doc) {
  const participants = Array.isArray(doc.participants) ? doc.participants : [];
  return participants
    .map((p) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean);
}

async function resolveStream(supabase) {
  const { data, error } = await supabase
    .from("streams")
    .select("id, slug, name")
    .eq("slug", STREAM_SLUG)
    .maybeSingle();
  if (error) throw new Error(`streams: ${error.message}`);
  if (!data) throw new Error(`Stream not found: ${STREAM_SLUG}`);
  return data;
}

async function fetchSessions(supabase, streamId) {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, name, occurred_at, created_at, seed_question, description, synthesis_document_id, finalized_at",
    )
    .eq("stream_id", streamId)
    .order("occurred_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`sessions: ${error.message}`);
  return data ?? [];
}

async function fetchDocuments(supabase, streamId) {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT)
    .eq("stream_id", streamId)
    .eq("is_draft", false)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`documents: ${error.message}`);
  return data ?? [];
}

function buildSourceBlock(doc, text) {
  const label =
    doc.type === "Transcript"
      ? "Transcript"
      : doc.type === "Reflection"
        ? "Reflection"
        : "Upload";
  const title = doc.title?.trim() || label;
  return `### ${title} (${label})\n<!-- document_id: ${doc.id} -->\n\n${text}`;
}

async function main() {
  const { supabase, mode } = await createSynthesisClient();
  console.log(`Export mode: ${mode}`);

  const stream = await resolveStream(supabase);
  console.log(`Stream: ${stream.name} (${stream.slug})`);

  ensureDir(exportRoot);
  ensureDir(path.join(exportRoot, "sources"));
  ensureDir(path.join(exportRoot, "sources/by-doc"));
  ensureDir(path.join(exportRoot, "reflections"));

  const sessions = await fetchSessions(supabase, stream.id);
  const documents = await fetchDocuments(supabase, stream.id);

  const sourceDocs = documents.filter(isSourceDocument);
  const excludedExternal = documents.filter(
    (d) => d.is_external && SOURCE_TYPES.has(d.type),
  ).length;
  const excludedSummaries = documents.filter((d) => d.type === "Summary").length;

  const docsBySession = new Map();
  for (const doc of sourceDocs) {
    if (!doc.session_id) continue;
    const list = docsBySession.get(doc.session_id) ?? [];
    list.push(doc);
    docsBySession.set(doc.session_id, list);
  }

  const reflectionsPublic = [
    "# Reflections (de-identified source text only)\n",
  ];
  const sessionRecords = [];
  const extractions = [];
  const ungrouped = [];

  const stats = {
    total_sessions: sessions.length,
    sessions_with_sources: 0,
    total_documents: documents.length,
    source_documents: sourceDocs.length,
    reflections: 0,
    transcripts: 0,
    uploads: 0,
    excluded_external: excludedExternal,
    excluded_summaries: excludedSummaries,
  };

  for (const session of sessions) {
    const sessionDocs = docsBySession.get(session.id) ?? [];
    const roster = sessionDocs.flatMap(rosterFromDoc);

    const sourceBlocks = [];
    const reflectionSignals = {
      highlights: [],
      feelings: [],
      takeaways: [],
      connections: [],
      bodies: [],
    };
    const sourceDocuments = [];

    for (const doc of sessionDocs) {
      const raw = sourceBody(doc);
      if (!raw) continue;

      const text = deidentifyText(raw, roster);
      if (!text) continue;

      sourceDocuments.push({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        chars: text.length,
        privacy_status: doc.privacy_status,
      });

      sourceBlocks.push(buildSourceBlock(doc, text));
      writeText(
        path.join(
          exportRoot,
          "sources/by-doc",
          `${doc.id}-${slugifySessionName(doc.title ?? doc.type)}.md`,
        ),
        text,
      );

      if (doc.type === "Reflection") {
        stats.reflections += 1;
        reflectionSignals.bodies.push(text.slice(0, 800));
        reflectionSignals.takeaways.push(text.slice(0, 500));
      } else if (doc.type === "Transcript") {
        stats.transcripts += 1;
      } else if (doc.type === "Note") {
        stats.uploads += 1;
      }
    }

    const sourceText = sourceBlocks.join("\n\n---\n\n").slice(0, 250_000);
    if (sourceText) stats.sessions_with_sources += 1;

    if (sourceText) {
      const fileName = `${session.id}-${slugifySessionName(session.name)}-sources.md`;
      writeText(path.join(exportRoot, "sources", fileName), sourceText);
    }

    const reflectionDocs = sessionDocs.filter((d) => d.type === "Reflection");
    if (reflectionDocs.length > 0) {
      reflectionsPublic.push(
        `\n## ${session.name}\n<!-- session_id: ${session.id} -->\n`,
      );
      for (const [idx, doc] of reflectionDocs.entries()) {
        const text = deidentifyText(sourceBody(doc), roster);
        if (!text) continue;
        reflectionsPublic.push(
          `\n### Reflection ${idx + 1}: ${doc.title ?? "Untitled"}\n\n${text}\n`,
        );
        writeText(
          path.join(exportRoot, "reflections", `${session.id}-${idx + 1}.md`),
          text,
        );
      }
    }

    sessionRecords.push({
      session_id: session.id,
      event_id: session.id,
      event_name: session.name,
      session_name: session.name,
      occurred_at: session.occurred_at,
      start_time: session.occurred_at,
      created_at: session.created_at,
      seed_question: session.seed_question,
      status: session.finalized_at ? "finalized" : "open",
      finalized_at: session.finalized_at,
      has_sources: Boolean(sourceText),
      source_document_count: sourceDocuments.length,
      source_types: [...new Set(sourceDocuments.map((d) => d.type))],
      reflection_count: reflectionDocs.length,
    });

    if (!sourceText) continue;

    extractions.push({
      event_id: session.id,
      session_id: session.id,
      event_name: session.name,
      start_time: session.occurred_at,
      source_text: sourceText,
      source_document_count: sourceDocuments.length,
      source_documents: sourceDocuments,
      source_types: [...new Set(sourceDocuments.map((d) => d.type))],
      // Legacy fields kept empty so retrieval never scores harvest brief sections
      brief_summary: "",
      highlights: "",
      balcony_observations: "",
      tensions: "",
      key_questions: "",
      theme_tags: "",
      what_emerged: "",
      key_insights: "",
      meta: "",
      resonance: "",
      inquiries: extractInquiryList(sourceText),
      inquiries_raw: "",
      full_summary: sourceText,
      reflection_signals: reflectionSignals,
      has_summary: true,
      reflection_count: reflectionDocs.length,
    });
  }

  // Ungrouped source documents
  for (const doc of sourceDocs.filter((d) => !d.session_id)) {
    const text = deidentifyText(sourceBody(doc), rosterFromDoc(doc));
    if (!text) continue;

    ungrouped.push({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      privacy_status: doc.privacy_status,
      created_at: doc.created_at,
      text: text.slice(0, 50_000),
    });

    writeText(
      path.join(
        exportRoot,
        "sources/by-doc",
        `${doc.id}-${slugifySessionName(doc.title ?? doc.type)}.md`,
      ),
      text,
    );

    if (doc.type === "Reflection") stats.reflections += 1;
    else if (doc.type === "Transcript") stats.transcripts += 1;
    else if (doc.type === "Note") stats.uploads += 1;

    extractions.push({
      event_id: `doc:${doc.id}`,
      session_id: null,
      event_name: doc.title || `Ungrouped ${doc.type}`,
      start_time: doc.created_at,
      source_text: text,
      source_document_count: 1,
      source_documents: [
        { id: doc.id, type: doc.type, title: doc.title, chars: text.length },
      ],
      source_types: [doc.type],
      brief_summary: "",
      highlights: "",
      balcony_observations: "",
      tensions: "",
      key_questions: "",
      theme_tags: "",
      what_emerged: "",
      key_insights: "",
      meta: "",
      resonance: "",
      inquiries: extractInquiryList(text),
      inquiries_raw: "",
      full_summary: text,
      reflection_signals: {
        highlights: [],
        feelings: [],
        takeaways: doc.type === "Reflection" ? [text.slice(0, 500)] : [],
        connections: [],
        bodies: [text.slice(0, 800)],
      },
      has_summary: true,
      reflection_count: doc.type === "Reflection" ? 1 : 0,
    });
  }

  writeText(path.join(exportRoot, "reflections-public.md"), reflectionsPublic.join(""));
  writeJson(path.join(exportRoot, "sessions.json"), sessionRecords);
  writeJson(path.join(exportRoot, "ungrouped.json"), ungrouped);
  writeJson(path.join(exportRoot, "stats.json"), stats);
  writeJson(path.join(root, "synthesis/work/extractions.json"), extractions);

  writeJson(path.join(exportRoot, "manifest.json"), {
    exported_at: new Date().toISOString(),
    mode,
    stream_slug: stream.slug,
    stream_name: stream.name,
    corpus: "source-only",
    source_types: ["Transcript", "Reflection", "Note"],
    excluded: ["Summary", "harvest_briefs", "is_external"],
    session_count: sessions.length,
    sessions_with_sources: stats.sessions_with_sources,
    source_document_count: sourceDocs.length,
    reflection_count: stats.reflections,
    transcript_count: stats.transcripts,
    upload_count: stats.uploads,
    excluded_external: excludedExternal,
    note: "Quotes and retrieval use raw source content only — not element or session harvest briefs.",
  });

  console.log("Export complete (source materials only).");
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  With sources: ${stats.sessions_with_sources}`);
  console.log(`  Transcripts: ${stats.transcripts}`);
  console.log(`  Reflections: ${stats.reflections}`);
  console.log(`  Uploads: ${stats.uploads}`);
  console.log(`  Excluded external source docs: ${excludedExternal}`);
  console.log(`  Output: ${exportRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
