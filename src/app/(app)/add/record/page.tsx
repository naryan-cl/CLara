import { AddWithSessionComposer } from "@/components/AddWithSessionComposer";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";

export default async function AddRecordPage() {
  const bootstrap = await loadSessionComposerData();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Record</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Record dialogue with your mic and/or system audio. CLara
          transcribes, summarizes, and adds it to the commons.
        </p>
      </div>

      <AddWithSessionComposer
        sessions={bootstrap.sessions}
        peers={bootstrap.peers}
        createLabel="Create session"
        loadError={bootstrap.error}
        mode="record"
      />
    </div>
  );
}
