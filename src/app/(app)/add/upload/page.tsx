import { ReceiveUploadForm } from "@/components/ReceiveUploadForm";

export default function AddUploadPage() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
          Add · Upload
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Upload
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Bring existing thinking into the Commons — upload a file (text, PDF,
          DOCX, or short audio), or add text. Audio is transcribed like Record;
          both paths store Markdown with OKF metadata.
        </p>
      </div>

      <ReceiveUploadForm />
    </div>
  );
}
