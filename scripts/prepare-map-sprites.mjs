/**
 * Copy curated extracts from Sprites/extracted into public/map-sprites
 * and write a theme-scoped manifest.json.
 *
 * Usage: node scripts/prepare-map-sprites.mjs
 * (npm run sprites:prepare)
 *
 * Prerequisites:
 *   1. python Sprites/split_sprites2.py  (edge flood-fill alpha; overwrites extracts)
 *   2. Cull bad icons under Sprites/extracted/ (see Sprites/README.md)
 *
 * Wipes public/map-sprites/ then rebuilds theme packs from POOLS below.
 * Mapping (node type → extract sheet folders) matches Phase 7 plan.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const EXTRACTED = path.join(ROOT, "Sprites", "extracted");
const OUT = path.join(ROOT, "public", "map-sprites");

/** @type {Record<string, Record<string, string[]>>} */
const POOLS = {
  plant: {
    Atom: ["mushrooms1"],
    Concept: ["plants1", "plants2"],
    Framework: ["plants3"],
    Theme: ["plants3", "plants1"],
  },
  ocean: {
    Atom: ["ocean-deepsea"],
    Concept: ["ocean-reeffish"],
    Framework: ["ocean-coral", "ocean-crustaceans"],
    Theme: ["ocean-jellyturtleshark", "ocean-aquaticmammals"],
  },
  desert: {
    Atom: ["desert-rocks"],
    Concept: ["desert-cacti1", "desert-plants"],
    Framework: ["desert-reptiles", "desert-reptiles2"],
    Theme: ["desert-mammals"],
  },
};

const NODE_TYPES = ["Atom", "Concept", "Framework", "Theme"];
const THEMES = ["plant", "ocean", "desert"];

function listIcons(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith(".png"))
    .sort();
}

function rimrafDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) rimrafDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

function ensureEmpty(dir) {
  if (fs.existsSync(dir)) rimrafDir(dir);
  fs.mkdirSync(dir, { recursive: true });
}

function copyPool(theme, type, sheetSlugs) {
  const typeDir = type.toLowerCase();
  const destDir = path.join(OUT, theme, typeDir);
  fs.mkdirSync(destDir, { recursive: true });

  const seen = new Set();
  /** @type {string[]} */
  const sources = [];
  for (const slug of sheetSlugs) {
    const srcDir = path.join(EXTRACTED, theme, slug);
    for (const file of listIcons(srcDir)) {
      const abs = path.join(srcDir, file);
      // Dedupe by basename+size so Theme mix of plants3+plants1 doesn't collide oddly
      const key = `${slug}/${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(abs);
    }
  }

  /** @type {string[]} */
  const relPaths = [];
  sources.forEach((src, i) => {
    const name = `icon_${String(i).padStart(2, "0")}.png`;
    fs.copyFileSync(src, path.join(destDir, name));
    relPaths.push(`${theme}/${typeDir}/${name}`);
  });
  return relPaths;
}

function main() {
  if (!fs.existsSync(EXTRACTED)) {
    console.error(
      "Missing Sprites/extracted — run: python Sprites/split_sprites2.py",
    );
    process.exit(1);
  }

  // Wipe previous theme packs; keep nothing stale
  ensureEmpty(OUT);

  /** @type {Record<string, Record<string, string[]>>} */
  const manifest = {};

  for (const theme of THEMES) {
    manifest[theme] = {};
    for (const type of NODE_TYPES) {
      const sheets = POOLS[theme][type];
      const paths = copyPool(theme, type, sheets);
      manifest[theme][type] = paths;
      console.log(
        `[${theme}] ${type}: ${paths.length} icons from ${sheets.join(", ")}`,
      );
    }
  }

  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log("Wrote public/map-sprites/manifest.json");
}

main();
