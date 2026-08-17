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
          className="flex min-w-0 items-baseline justify-between gap-4 border-b border-cloud pb-3 last:border-0 last:pb-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/sessions/documents/${doc.id}`}
                className="truncate font-medium text-ink hover:text-forest hover:underline"
              >
                {doc.title?.trim() || "Untitled"}
              </Link>
              {doc.privacy_status === "private" ? (
                <span
                  className="font-mono text-[11px] text-ink/40"
                  title="Hidden from public"
                >
                  · private
                </span>
              ) : null}
            </div>
            <p className="font-mono text-[11px] text-ink/40">
              {doc.type ?? "untyped"}
              {doc.needs_review ? " · needs review" : ""}
            </p>
          </div>
          <time className="shrink-0 font-mono text-[11px] text-ink/40 sm:hidden">
            {new Date(doc.created_at).toLocaleDateString()}
          </time>
          <time className="hidden shrink-0 font-mono text-[11px] text-ink/40 sm:inline">
            {dateStyle === "date"
              ? new Date(doc.created_at).toLocaleDateString()
              : new Date(doc.created_at).toLocaleString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
