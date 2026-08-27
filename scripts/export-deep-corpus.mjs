/**
 * Export Transcript source text for deep synthesis pass.
 * Content only — no harvest briefs. Excludes is_external.
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

const STREAM_SLUG = process.env.SYNTHESIS_STREAM_SLUG?.trim() || "camp-clai";

async function main() {
  const { supabase, mode } = await createSynthesisClient();
  console.log(`Mode: ${mode}`);
  if (mode !== "service_role") {
    console.log(
      "Note: authenticated deep export. Transcript content only; external docs excluded.",
    );
  }

  const { data: stream, error: streamError } = await supabase
    .from("streams")
    .select("id, slug, name")
    .eq("slug", STREAM_SLUG)
    .maybeSingle();
  if (streamError) throw new Error(streamError.message);
  if (!stream) throw new Error(`Stream not found: ${STREAM_SLUG}`);

  const out = path.join(root, "synthesis/export/deep");
  ensureDir(out);
  ensureDir(path.join(out, "transcripts"));

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, occurred_at")
    .eq("stream_id", stream.id);

  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));

  const { data: transcripts, error } = await supabase
    .from("documents")
    .select(
      "id, title, content, session_id, privacy_status, participants, created_at, type, is_external",
    )
    .eq("stream_id", stream.id)
    .eq("type", "Transcript")
    .eq("is_draft", false)
    .eq("is_external", false)
    .limit(500);

  if (error) throw new Error(error.message);

  const index = [];
  let kept = 0;

  for (const doc of transcripts ?? []) {
    const roster = (Array.isArray(doc.participants) ? doc.participants : [])
      .map((p) => (typeof p === "string" ? p : p?.name))
      .filter(Boolean);
    const raw = (doc.content?.trim() || "").slice(0, 200_000);
    const text = deidentifyText(raw, roster);
    const session = doc.session_id ? sessionById.get(doc.session_id) : null;
    const eventId = doc.session_id || `doc:${doc.id}`;

    if (!text || text.length < 80) {
      index.push({
        event_id: eventId,
        document_id: doc.id,
        event_name: session?.name ?? doc.title,
        start_time: session?.occurred_at ?? doc.created_at,
        chars: 0,
        skipped: true,
        privacy_status: doc.privacy_status,
      });
      continue;
    }

    const fileBase = `${eventId}-${slugifySessionName(session?.name ?? doc.title)}.txt`;
    writeText(path.join(out, "transcripts", fileBase), text);
    writeText(path.join(out, "transcripts", `${eventId}.txt`), text);
    index.push({
      event_id: eventId,
      document_id: doc.id,
      event_name: session?.name ?? doc.title ?? "Transcript",
      start_time: session?.occurred_at ?? doc.created_at,
      chars: text.length,
      skipped: false,
      privacy_status: doc.privacy_status,
      file: fileBase,
    });
    kept += 1;
  }

  writeJson(path.join(out, "transcript-index.json"), index);
  writeJson(path.join(out, "manifest.json"), {
    exported_at: new Date().toISOString(),
    stream_slug: stream.slug,
    corpus: "transcript-content-only",
    excluded: ["summary", "is_external"],
    transcripts: kept,
    transcripts_skipped: index.filter((i) => i.skipped).length,
  });

  console.log(`Deep export complete: ${kept} transcript source files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
