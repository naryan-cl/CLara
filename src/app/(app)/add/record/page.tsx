import { AddWithSessionComposer } from "@/components/AddWithSessionComposer";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";

export default async function AddRecordPage() {
  const bootstrap = await loadSessionComposerData();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
          Add · Record
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Record
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Capture with your mic — optionally mix in system/tab audio. Long
          meetings upload in ~12-minute chunks (Listens v2 Module B, up to ~3
          hours). Connect to a session or create one so others can join.
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
