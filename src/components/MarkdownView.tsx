import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

/** Read-only formatted view of Commons markdown content. */
export function MarkdownView({
  markdown,
  emptyLabel = "(empty)",
}: {
  markdown: string;
  emptyLabel?: string;
}) {
  if (!markdown?.trim()) {
    return <p className="text-sm text-ink/50">{emptyLabel}</p>;
  }

  return (
    <div
      className={[
        "text-sm leading-6 text-ink",
        "[&_h1]:mb-3 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-medium",
        "[&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium",
        "[&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-medium",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_p]:my-2",
        "[&_a]:text-horizon [&_a]:underline",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_u]:underline",
        "[&_code]:rounded [&_code]:bg-cloud/60 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs",
      ].join(" ")}
    >
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{markdown}</ReactMarkdown>
    </div>
  );
}
