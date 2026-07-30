import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/DocumentEditor";
import { getDocumentById } from "@/lib/documents/get-document";
import { getActiveStream } from "@/lib/streams/get-active-stream";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: PageProps) {
  const { id } = await params;
  const { stream } = await getActiveStream();
  const { document, error } = await getDocumentById(id);

  if (error) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="font-mono text-sm text-danger">{error}</p>
        <Link
          href="/sessions"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  if (!document) {
    notFound();
  }

  // Soft guard: prefer docs in the active stream (RLS is the real boundary).
  if (stream && document.stream_id !== stream.id) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          This document belongs to another stream than your active one.
        </p>
        <Link
          href="/sessions"
          className="mt-4 inline-block text-sm text-horizon hover:underline"
        >
          ← Back to Sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/sessions"
        className="text-sm text-horizon hover:underline"
      >
        ← Back to Sessions
      </Link>
      <DocumentEditor document={document} />
    </div>
  );
}
