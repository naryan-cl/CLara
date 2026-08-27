import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ev = fs.readFileSync(
  path.join(root, "public/synthesis/theme-evidence-ui.json"),
  "utf8",
);
const mapPath = path.join(root, "public/synthesis/map.html");
let html = fs.readFileSync(mapPath, "utf8");
html = html.replace(
  /<script>\s*window\.__SYNTHESIS_EVIDENCE__[\s\S]*?<\/script>\s*/g,
  "",
);
const inject = `<script>window.__SYNTHESIS_EVIDENCE__ = ${ev};</script>\n`;
const idx = html.indexOf("const nodes = [");
if (idx < 0) throw new Error("nodes marker not found");
const scriptStart = html.lastIndexOf("<script>", idx);
if (scriptStart < 0) throw new Error("script tag not found");
html = html.slice(0, scriptStart) + inject + html.slice(scriptStart);
fs.writeFileSync(mapPath, html);
fs.copyFileSync(
  mapPath,
  path.join(root, "content/preliminary-synthesis-map.html"),
);
console.log("inlined evidence into map.html");
