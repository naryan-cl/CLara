import Link from "next/link";
import type { CommonsDocument } from "@/lib/documents/types";

export function DocumentList({
  documents,
  dateStyle = "datetime",
}: {
  documents: CommonsDocument[];
  dateStyle?: "datetime" | "date";
}) {
  return (
    <ul className="flex flex-col gap-3">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-baseline justify-between gap-4 border-b border-cloud pb-3 last:border-0 last:pb-0"
        >
          <div>
            <Link
              href={`/sessions/documents/${doc.id}`}
              className="font-medium text-ink hover:text-forest hover:underline"
            >
              {doc.title?.trim() || "Untitled"}
            </Link>
            <p className="font-mono text-[11px] text-ink/40">
              {doc.type ?? "untyped"}
              {doc.needs_review ? " · needs review" : ""}
            </p>
          </div>
          <time className="shrink-0 font-mono text-[11px] text-ink/40">
            {dateStyle === "date"
              ? new Date(doc.created_at).toLocaleDateString()
              : new Date(doc.created_at).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
