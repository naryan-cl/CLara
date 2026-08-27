/**
 * Deep theme retrieval over summaries + transcripts.
 * Usage: node scripts/retrieve-theme-evidence-deep.mjs
 * No survey mapping (project has no welcome survey).
 */
import fs from "fs";
import path from "path";
import { root, writeJson, writeText } from "./lib/synthesis-env.mjs";
import { THEMES } from "./lib/synthesis-themes.mjs";

const exportDir = path.join(root, "synthesis/export");
const deepDir = path.join(exportDir, "deep");
const workDir = path.join(root, "synthesis/work");
const transcriptDir = path.join(deepDir, "transcripts");

const CATCHPHRASES = [
  "capability expander",
  "organizational ludicrousness",
  "ludicrousness",
  "expertise paradox",
  "discernment tax",
  "workslop",
  "death-doula",
  "death doula",
  "cambrian explosion",
  "slow down while moving fast",
  "mind traps",
  "mind trap",
  "weird luxury",
  "data sovereignty",
  "humanist stance",
];

function scoreText(text, concepts) {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return { score: 0, hits: [] };
  const hits = [];
  for (const c of concepts) {
    if (lower.includes(c.toLowerCase())) hits.push(c);
  }
  return {
    score: hits.length + Math.min(hits.length * 0.1, 2),
    hits: [...new Set(hits)],
  };
}

function extractSentences(text, concepts, limit = 8) {
  const sentences = (text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 400);

  const scored = [];
  for (const s of sentences) {
    const { score, hits } = scoreText(s, concepts);
    if (score < 1) continue;
    const bonus =
      (/"|said|i think|i feel|we need|what if|imagine/i.test(s) ? 0.5 : 0) +
      (hits.length >= 2 ? 0.4 : 0);
    scored.push({ text: s, score: score + bonus, hits });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const row of scored) {
    const key = row.text.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function loadTranscript(eventId) {
  const direct = path.join(transcriptDir, `${eventId}.txt`);
  if (fs.existsSync(direct)) return fs.readFileSync(direct, "utf8");
  if (!fs.existsSync(transcriptDir)) return "";
  const match = fs
    .readdirSync(transcriptDir)
    .find((f) => f.startsWith(String(eventId)));
  if (!match) return "";
  return fs.readFileSync(path.join(transcriptDir, match), "utf8");
}

function trackCatchphrases(extractions, transcriptIndex) {
  const chronology = [];
  for (const phrase of CATCHPHRASES) {
    const hits = [];
    for (const ext of extractions) {
      const blob = `${ext.full_summary ?? ""}\n${ext.key_insights ?? ""}`.toLowerCase();
      if (blob.includes(phrase.toLowerCase())) {
        hits.push({
          source: "summary",
          event_id: ext.event_id,
          event_name: ext.event_name,
          start_time: ext.start_time,
        });
      }
    }
    for (const row of transcriptIndex) {
      if (row.skipped) continue;
      const text = loadTranscript(row.event_id).toLowerCase();
      if (text.includes(phrase.toLowerCase())) {
        hits.push({
          source: "transcript",
          event_id: row.event_id,
          event_name: row.event_name,
          start_time: row.start_time,
        });
      }
    }
    hits.sort(
      (a, b) =>
        new Date(a.start_time ?? 0).getTime() -
        new Date(b.start_time ?? 0).getTime(),
    );
    if (hits.length) {
      chronology.push({ phrase, count: hits.length, appearances: hits.slice(0, 12) });
    }
  }
  return chronology;
}

function main() {
  const extractions = JSON.parse(
    fs.readFileSync(path.join(workDir, "extractions.json"), "utf8"),
  );
  const sessions = JSON.parse(
    fs.readFileSync(path.join(exportDir, "sessions.json"), "utf8"),
  );
  const sessionById = new Map(
    sessions.map((s) => [s.event_id ?? s.session_id, s]),
  );

  let transcriptIndex = [];
  const indexPath = path.join(deepDir, "transcript-index.json");
  if (fs.existsSync(indexPath)) {
    transcriptIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  }

  const results = {};

  for (const theme of THEMES) {
    const ranked = [];

    for (const ext of extractions) {
      const summaryBlob = [
        ext.what_emerged,
        ext.key_insights,
        ext.brief_summary,
        ext.highlights,
        ext.tensions,
        ext.meta,
        ext.full_summary,
        ...(ext.reflection_signals?.takeaways ?? []),
      ].join("\n\n");

      const transcript = loadTranscript(ext.event_id);
      const summaryScore = scoreText(summaryBlob, theme.concepts);
      const transcriptScore = scoreText(transcript, theme.concepts);
      const score = summaryScore.score * 1.2 + transcriptScore.score * 0.35;
      if (score < 1.5) continue;

      const hits = [...new Set([...summaryScore.hits, ...transcriptScore.hits])];
      ranked.push({
        event_id: ext.event_id,
        event_name: ext.event_name,
        start_time:
          sessionById.get(ext.event_id)?.start_time ??
          sessionById.get(ext.event_id)?.occurred_at ??
          ext.start_time,
        score,
        hits,
        summary_score: summaryScore.score,
        transcript_score: transcriptScore.score,
        what_emerged: (ext.what_emerged ?? "").slice(0, 600),
        key_insights: (ext.key_insights ?? "").slice(0, 1000),
        tensions: (ext.tensions ?? "").slice(0, 500),
        transcript_sentences: extractSentences(transcript, theme.concepts, 6),
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    results[theme.id] = {
      title: theme.title,
      shortTitle: theme.shortTitle,
      session_count: ranked.length,
      top_sessions: ranked.slice(0, 14),
    };
  }

  const catchphrases = trackCatchphrases(extractions, transcriptIndex);

  writeJson(path.join(workDir, "theme-evidence-deep.json"), {
    generated_at: new Date().toISOString(),
    source: "summaries+reflections+transcripts",
    themes: results,
    catchphrases,
  });

  let md = `# Deep theme evidence\n\nGenerated: ${new Date().toISOString()}\n\n`;
  if (catchphrases.length) {
    md += `## Catchphrases that traveled\n\n`;
    for (const c of catchphrases) {
      md += `- **${c.phrase}** (${c.count}): ${c.appearances
        .map((a) => a.event_name)
        .slice(0, 5)
        .join("; ")}\n`;
    }
    md += `\n`;
  }

  for (const theme of THEMES) {
    const data = results[theme.id];
    md += `\n## ${data.title} (${data.session_count})\n\n`;
    for (const s of data.top_sessions.slice(0, 8)) {
      md += `### ${s.event_name} (score ${s.score.toFixed(1)})\n\n`;
      if (s.key_insights) md += `${s.key_insights}\n\n`;
      if (s.transcript_sentences?.length) {
        md += `**Transcript lines:**\n`;
        for (const line of s.transcript_sentences) {
          md += `> ${line.text}\n\n`;
        }
      }
    }
  }

  writeText(path.join(workDir, "theme-evidence-deep.md"), md);

  // Curated addendum scaffold for humans
  let addendum = `# Theme rubric — deep pass addendum\n\n`;
  addendum += `Generated: ${new Date().toISOString()}\n\n`;
  addendum += `Transcript deepening for Camp CLAI Preliminary Synthesis. No survey corpus.\n\n`;
  if (catchphrases.length) {
    addendum += `## Catchphrases (chronology)\n\n`;
    for (const c of catchphrases) {
      addendum += `### ${c.phrase}\n`;
      for (const a of c.appearances) {
        addendum += `- ${a.start_time ?? "?"} · ${a.event_name} (${a.source})\n`;
      }
      addendum += `\n`;
    }
  }
  writeText(
    path.join(root, "synthesis/output/theme-rubric-deep-addendum.md"),
    addendum,
  );

  console.log("Wrote theme-evidence-deep.* and deep addendum scaffold");
  for (const theme of THEMES) {
    console.log(`  ${theme.id}: ${results[theme.id].session_count}`);
  }
}

main();
