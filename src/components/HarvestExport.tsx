"use client";

type HarvestSession = {
  name: string;
  documents: { title: string | null; content: string }[];
};

function buildMarkdown(sessions: HarvestSession[]): string {
  return sessions
    .map((session) => {
      const body = session.documents
        .map((doc) => `## ${doc.title?.trim() || "Untitled"}\n\n${doc.content}`)
        .join("\n\n---\n\n");
      return `# ${session.name}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

export function HarvestExport({ sessions }: { sessions: HarvestSession[] }) {
  function onDownload() {
    const markdown = buildMarkdown(sessions);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "my-harvest.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={onDownload}
      className="rounded-md border border-cloud px-4 py-2 text-sm font-medium text-ink/70 hover:text-ink"
    >
      Download as Markdown
    </button>
  );
}
