import fs from "fs";
import path from "path";

const SYNTHESIS_PATH = path.join(
  process.cwd(),
  "content/preliminary-synthesis.md",
);

export function preliminarySynthesisFileExists(): boolean {
  try {
    return fs.existsSync(SYNTHESIS_PATH) && fs.statSync(SYNTHESIS_PATH).isFile();
  } catch {
    return false;
  }
}

/** Published when the content file exists. Opt out with PRELIMINARY_SYNTHESIS_PUBLISHED=false. */
export function isPreliminarySynthesisPublished(): boolean {
  if (process.env.PRELIMINARY_SYNTHESIS_PUBLISHED === "false") return false;
  return preliminarySynthesisFileExists();
}

export function getPreliminarySynthesisMarkdown(): string | null {
  if (!preliminarySynthesisFileExists()) return null;
  const raw = fs.readFileSync(SYNTHESIS_PATH, "utf8").trim();
  return raw || null;
}

export function shouldShowPreliminarySynthesis(
  isAdmin: boolean,
): boolean {
  if (!preliminarySynthesisFileExists()) return false;
  if (isPreliminarySynthesisPublished()) return true;
  return isAdmin;
}
