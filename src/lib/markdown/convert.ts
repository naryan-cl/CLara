import { marked } from "marked";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndown.addRule("underline", {
  filter: ["u"],
  replacement(content) {
    // Markdown has no native underline — keep a tiny HTML tag in the .md body.
    return `<u>${content}</u>`;
  },
});

marked.setOptions({ gfm: true, breaks: false });

/** Markdown → HTML for TipTap initial content / read views. */
export function markdownToHtml(markdown: string): string {
  const raw = markdown?.trim() ? markdown : "";
  return marked.parse(raw, { async: false }) as string;
}

/** TipTap HTML → Markdown for Commons storage. */
export function htmlToMarkdown(html: string): string {
  if (!html?.trim() || html === "<p></p>") return "";
  return turndown.turndown(html).trim();
}
