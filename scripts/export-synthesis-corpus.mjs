/**
 * Export Camp CLAI Commons corpus for Preliminary Synthesis.
 *
 * Usage: node scripts/export-synthesis-corpus.mjs
 *
 * Requires SUPABASE_SECRET_KEY (or service role) in .env.local, or
 * authenticated export via anon key + SYNTHESIS_EXPORT_EMAIL/PASSWORD.
 *
 * Prefer public documents; de-identify text before writing export files.
 * Does not export surveys (none in this project). Never commit export/.
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
import {
  extractInquiryList,
  parseSummarySections,
  sectionBlock,
} from "./lib/synthesis-section-parser.mjs";

const STREAM_SLUG = process.env.SYNTHESIS_STREAM_SLUG?.trim() || "camp-clai";
const exportRoot = path.join(root, "synthesis/export");
const DOCUMENT_SELECT =
  "id, stream_id, created_by, content, summary, title, session_id, type, participants, tags, privacy_status, needs_review, is_draft, is_external, created_at, updated_at";

function bodyForAnalysis(doc) {
  if (doc.type === "Summary") {
    return doc.content?.trim() || "";
  }
  const summary = doc.summary?.trim();
  if (summary) return summary;
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

async function main() {
  const { supabase, mode } = await createSynthesisClient();
  console.log(`Export mode: ${mode}`);

  const stream = await resolveStream(supabase);
  console.log(`Stream: ${stream.name} (${stream.slug})`);

  ensureDir(exportRoot);
  ensureDir(path.join(exportRoot, "summaries"));
  ensureDir(path.join(exportRoot, "reflections"));
  ensureDir(path.join(exportRoot, "sections"));

  const sessions = await fetchSessions(supabase, stream.id);
  const documents = await fetchDocuments(supabase, stream.id);

  // Prefer public docs; still include private Summaries for organizer synthesis
  // but scrub them. Reflections/transcripts: public preferred.
  const publicDocs = documents.filter((d) => d.privacy_status === "public");
  const usefulDocs = documents.filter((d) => {
    if (d.privacy_status === "public") return true;
    if (d.type === "Summary") return true;
    return false;
  });

  const docsBySession = new Map();
  for (const doc of usefulDocs) {
    if (!doc.session_id) continue;
    const list = docsBySession.get(doc.session_id) ?? [];
    list.push(doc);
    docsBySession.set(doc.session_id, list);
  }

  const sectionFiles = {
    brief_summary: "# Brief summary sections\n",
    highlights: "# Highlights sections\n",
    balcony: "# Balcony observations\n",
    tensions: "# Tensions sections\n",
    key_questions: "# Key questions\n",
    theme_tags: "# Theme tags\n",
  };

  const reflectionsPublic = ["# Reflections (de-identified, public-preferred)\n"];
  const sessionRecords = [];
  const extractions = [];
  const ungrouped = [];

  const stats = {
    total_sessions: sessions.length,
    with_summary: 0,
    total_documents: documents.length,
    public_documents: publicDocs.length,
    reflections: 0,
    transcripts: 0,
    notes: 0,
    summaries: 0,
  };

  for (const session of sessions) {
    const sessionDocs = docsBySession.get(session.id) ?? [];
    const synthesisDoc =
      sessionDocs.find((d) => d.id === session.synthesis_document_id) ||
      sessionDocs.find((d) => d.type === "Summary");

    const roster = sessionDocs.flatMap(rosterFromDoc);
    const summaryRaw = synthesisDoc ? bodyForAnalysis(synthesisDoc) : "";
    const summaryText = deidentifyText(summaryRaw, roster);

    const reflectionBodies = [];
    const reflectionSignals = {
      highlights: [],
      feelings: [],
      takeaways: [],
      connections: [],
      bodies: [],
    };

    for (const doc of sessionDocs) {
      if (doc.type === "Summary") {
        stats.summaries += 1;
        continue;
      }
      if (doc.type === "Reflection") {
        stats.reflections += 1;
        const text = deidentifyText(bodyForAnalysis(doc), roster);
        if (!text) continue;
        reflectionBodies.push({ id: doc.id, title: doc.title, text });
        reflectionSignals.bodies.push(text.slice(0, 800));
        reflectionSignals.takeaways.push(text.slice(0, 500));
      } else if (doc.type === "Transcript") {
        stats.transcripts += 1;
        const brief = deidentifyText(doc.summary?.trim() || "", roster);
        if (brief) {
          reflectionSignals.bodies.push(brief.slice(0, 800));
          reflectionSignals.takeaways.push(brief.slice(0, 500));
        }
      } else {
        stats.notes += 1;
        const brief = deidentifyText(bodyForAnalysis(doc), roster);
        if (brief) {
          reflectionSignals.bodies.push(brief.slice(0, 800));
          reflectionSignals.takeaways.push(brief.slice(0, 500));
        }
      }
    }

    // Prefer session Summary; else stitch child briefs for retrieval coverage
    let effectiveSummary = summaryText;
    if (!effectiveSummary) {
      const childBriefs = sessionDocs
        .filter((d) => d.type !== "Summary")
        .map((d) => deidentifyText(bodyForAnalysis(d), roster))
        .filter(Boolean);
      if (childBriefs.length) {
        effectiveSummary = childBriefs.join("\n\n---\n\n").slice(0, 20_000);
      }
    }
    if (effectiveSummary) stats.with_summary += 1;

    const parsed = parseSummarySections(effectiveSummary);
    const sections = parsed.sections;

    if (effectiveSummary) {
      const suffix = summaryText ? "" : "-from-children";
      const fileName = `${session.id}-${slugifySessionName(session.name)}${suffix}.md`;
      writeText(path.join(exportRoot, "summaries", fileName), effectiveSummary);
    }

    for (const [key, fileKey] of [
      ["brief_summary", "brief_summary"],
      ["highlights", "highlights"],
      ["balcony_observations", "balcony"],
      ["tensions_and_polarities", "tensions"],
      ["tensions", "tensions"],
      ["key_questions", "key_questions"],
      ["theme_tags", "theme_tags"],
    ]) {
      if (sections[key]) {
        sectionFiles[fileKey] += sectionBlock(session.name, session.id, sections[key]);
      }
    }

    if (reflectionBodies.length > 0) {
      reflectionsPublic.push(`\n## ${session.name}\n<!-- session_id: ${session.id} -->\n`);
      for (const [idx, row] of reflectionBodies.entries()) {
        reflectionsPublic.push(`\n### Reflection ${idx + 1}: ${row.title ?? "Untitled"}\n\n${row.text}\n`);
        writeText(
          path.join(exportRoot, "reflections", `${session.id}-${idx + 1}.md`),
          row.text,
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
      synthesis_document_id: session.synthesis_document_id,
      has_summary: Boolean(effectiveSummary),
      has_session_synthesis: Boolean(summaryText),
      document_count: sessionDocs.length,
      reflection_count: reflectionBodies.length,
    });

    extractions.push({
      event_id: session.id,
      session_id: session.id,
      event_name: session.name,
      start_time: session.occurred_at,
      brief_summary: sections.brief_summary ?? "",
      highlights: sections.highlights ?? "",
      balcony_observations: sections.balcony_observations ?? "",
      tensions:
        sections.tensions_and_polarities ?? sections.tensions ?? "",
      key_questions: sections.key_questions ?? "",
      theme_tags: sections.theme_tags ?? "",
      what_emerged: sections.what_emerged ?? sections.brief_summary ?? "",
      key_insights: sections.key_insights ?? sections.highlights ?? "",
      meta: sections.meta ?? sections.balcony_observations ?? "",
      resonance: "",
      inquiries: extractInquiryList(sections.key_questions ?? ""),
      inquiries_raw: sections.key_questions ?? "",
      full_summary: effectiveSummary,
      reflection_signals: reflectionSignals,
      has_summary: Boolean(effectiveSummary),
      reflection_count: reflectionBodies.length,
    });
  }

  // Ungrouped public documents (not in a session)
  for (const doc of usefulDocs.filter((d) => !d.session_id)) {
    const text = deidentifyText(bodyForAnalysis(doc), rosterFromDoc(doc));
    if (!text) continue;
    ungrouped.push({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      privacy_status: doc.privacy_status,
      created_at: doc.created_at,
      text: text.slice(0, 12_000),
    });
    if (doc.type === "Reflection") {
      stats.reflections += 1;
      extractions.push({
        event_id: `doc:${doc.id}`,
        session_id: null,
        event_name: doc.title || "Ungrouped reflection",
        start_time: doc.created_at,
        brief_summary: "",
        highlights: "",
        balcony_observations: "",
        tensions: "",
        key_questions: "",
        theme_tags: "",
        what_emerged: text.slice(0, 1200),
        key_insights: text.slice(0, 1200),
        meta: "",
        resonance: "",
        inquiries: [],
        inquiries_raw: "",
        full_summary: text,
        reflection_signals: {
          highlights: [],
          feelings: [],
          takeaways: [text.slice(0, 500)],
          connections: [],
          bodies: [text.slice(0, 800)],
        },
        has_summary: true,
        reflection_count: 1,
      });
    }
  }

  for (const [key, content] of Object.entries(sectionFiles)) {
    writeText(path.join(exportRoot, "sections", `${key}.md`), content);
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
    session_count: sessions.length,
    summary_count: stats.with_summary,
    reflection_count: stats.reflections,
    transcript_docs: stats.transcripts,
    document_count: documents.length,
    public_document_count: publicDocs.length,
    note: "No pre-event survey in this project. Quotes are de-identified.",
  });

  console.log("Export complete.");
  console.log(`  Sessions: ${sessions.length}`);
  console.log(`  With summaries: ${stats.with_summary}`);
  console.log(`  Reflections: ${stats.reflections}`);
  console.log(`  Transcripts (docs): ${stats.transcripts}`);
  console.log(`  Output: ${exportRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
