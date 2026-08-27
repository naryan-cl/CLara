/**
 * Lightweight offline scrub for synthesis exports.
 * Prefer already-paraphrased Summary / summary fields for participant-facing quotes.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE = /https?:\/\/[^\s)>\]"']+/gi;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const SPEAKER_RE = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*:\s*/gm;

/**
 * @param {string | null | undefined} text
 * @param {string[]} [knownNames]
 */
export function deidentifyText(text, knownNames = []) {
  if (!text?.trim()) return "";
  let out = text;

  out = out.replace(EMAIL_RE, "[email]");
  out = out.replace(URL_RE, "[link]");
  out = out.replace(PHONE_RE, "[phone]");
  out = out.replace(SPEAKER_RE, "A participant: ");

  const names = [...new Set(knownNames.map((n) => n?.trim()).filter(Boolean))];
  for (const name of names.sort((a, b) => b.length - a.length)) {
    if (name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "a participant");
  }

  return out.trim();
}

export function slugifySessionName(name) {
  return (name ?? "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
