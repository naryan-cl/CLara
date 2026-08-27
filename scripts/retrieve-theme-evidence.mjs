/**
 * Concept-based retrieval for organizer theme rubric (summaries + reflections).
 * Usage: node scripts/retrieve-theme-evidence.mjs
 */
import fs from "fs";
import path from "path";
import { root, writeJson, writeText } from "./lib/synthesis-env.mjs";
import { THEMES } from "./lib/synthesis-themes.mjs";

const exportDir = path.join(root, "synthesis/export");
const workDir = path.join(root, "synthesis/work");

function scoreText(text, concepts) {
  const lower = (text ?? "").toLowerCase();
  if (!lower.trim()) return { score: 0, hits: [] };
  const hits = [];
  for (const c of concepts) {
    if (lower.includes(c.toLowerCase())) hits.push(c);
  }
  const score = hits.length + Math.min(hits.length * 0.15, 2);
  return { score, hits: [...new Set(hits)] };
}

function extractQuotes(markdown) {
  const quotes = [];
  const blockRe = /^>\s*"?([^"\n]+)"?\s*$/gm;
  let m;
  while ((m = blockRe.exec(markdown ?? ""))) {
    const q = m[1].trim();
    if (q.length > 20) quotes.push(q);
  }
  // Speech-like sentences from summary body
  const sentences = (markdown ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 280);
  for (const s of sentences) {
    if (/["']|said|i think|we need|what if|i feel|we are|people/i.test(s)) {
      quotes.push(s.replace(/^["']|["']$/g, ""));
    }
  }
  return [...new Set(quotes)].slice(0, 12);
}

function main() {
  const extractionsPath = path.join(workDir, "extractions.json");
  if (!fs.existsSync(extractionsPath)) {
    throw new Error("Missing synthesis/work/extractions.json — run export:synthesis first");
  }

  const extractions = JSON.parse(fs.readFileSync(extractionsPath, "utf8"));
  const sessions = JSON.parse(
    fs.readFileSync(path.join(exportDir, "sessions.json"), "utf8"),
  );
  const sessionById = new Map(
    sessions.map((s) => [s.event_id ?? s.session_id, s]),
  );

  const results = {};

  for (const theme of THEMES) {
    const ranked = [];

    for (const ext of extractions) {
      const blob = [
        ext.what_emerged,
        ext.key_insights,
        ext.brief_summary,
        ext.highlights,
        ext.tensions,
        ext.meta,
        ext.balcony_observations,
        ext.theme_tags,
        (ext.inquiries ?? []).join("\n"),
        ...(ext.reflection_signals?.highlights ?? []),
        ...(ext.reflection_signals?.feelings ?? []),
        ...(ext.reflection_signals?.takeaways ?? []),
        ...(ext.reflection_signals?.connections ?? []),
        ...(ext.reflection_signals?.bodies ?? []),
        ext.full_summary ?? "",
      ].join("\n\n");

      const { score, hits } = scoreText(blob, theme.concepts);
      if (score < 1.5) continue;

      let fullSummary = ext.full_summary ?? "";
      if (!fullSummary) {
        const summaryPath = fs
          .readdirSync(path.join(exportDir, "summaries"))
          .find((f) => f.startsWith(ext.event_id));
        if (summaryPath) {
          fullSummary = fs.readFileSync(
            path.join(exportDir, "summaries", summaryPath),
            "utf8",
          );
        }
      }

      ranked.push({
        event_id: ext.event_id,
        event_name: ext.event_name,
        start_time:
          sessionById.get(ext.event_id)?.start_time ??
          sessionById.get(ext.event_id)?.occurred_at ??
          ext.start_time ??
          null,
        score,
        hits,
        what_emerged: (ext.what_emerged ?? "").slice(0, 600),
        key_insights: (ext.key_insights ?? ext.highlights ?? "").slice(0, 1200),
        tensions: (ext.tensions ?? "").slice(0, 600),
        meta: (ext.meta ?? ext.balcony_observations ?? "").slice(0, 400),
        inquiries: ext.inquiries ?? [],
        reflections: {
          highlights: (ext.reflection_signals?.highlights ?? []).slice(0, 4),
          feelings: (ext.reflection_signals?.feelings ?? []).slice(0, 4),
          takeaways: (ext.reflection_signals?.takeaways ?? []).slice(0, 4),
        },
        quotes: extractQuotes(fullSummary),
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

  writeJson(path.join(workDir, "theme-evidence.json"), {
    generated_at: new Date().toISOString(),
    source: "summaries+reflections (transcripts via synthesis:deep)",
    themes: results,
  });

  let md = `# Theme evidence dump\n\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const theme of THEMES) {
    const data = results[theme.id];
    md += `\n## ${data.title} (${data.session_count} sessions)\n\n`;
    for (const s of data.top_sessions.slice(0, 10)) {
      md += `### ${s.event_name} (score ${s.score.toFixed(1)}; hits: ${s.hits.slice(0, 8).join(", ")})\n\n`;
      if (s.what_emerged) md += `**What emerged:** ${s.what_emerged}\n\n`;
      if (s.key_insights) md += `**Insights:**\n${s.key_insights}\n\n`;
      if (s.tensions) md += `**Tensions:** ${s.tensions}\n\n`;
      if (s.quotes.length) {
        md += `**Quotes:**\n${s.quotes.map((q) => `> ${q}`).join("\n")}\n\n`;
      }
      if (s.reflections.takeaways.length || s.reflections.highlights.length) {
        md += `**Reflections:**\n`;
        for (const r of s.reflections.highlights) md += `- Highlight: ${r}\n`;
        for (const r of s.reflections.takeaways) md += `- Takeaway: ${r}\n`;
        for (const r of s.reflections.feelings) md += `- Feeling: ${r}\n`;
        md += `\n`;
      }
    }
  }
  writeText(path.join(workDir, "theme-evidence.md"), md);
  console.log("Wrote theme-evidence.json and theme-evidence.md");
  for (const theme of THEMES) {
    console.log(`  ${theme.id}: ${results[theme.id].session_count} sessions`);
  }
}

main();
