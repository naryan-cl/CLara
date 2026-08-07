import { AddWithSessionComposer } from "@/components/AddWithSessionComposer";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";

export default async function AddUploadPage() {
  const bootstrap = await loadSessionComposerData();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Upload</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Bring existing thinking into the Commons — upload a file (text, PDF,
          DOCX, or short audio), or add text. Connect to a session or create one
          so others can join.
        </p>
      </div>

      <AddWithSessionComposer
        sessions={bootstrap.sessions}
        peers={bootstrap.peers}
        createLabel="Create session"
        loadError={bootstrap.error}
        mode="upload"
      />
    </div>
  );
}
