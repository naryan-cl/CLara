import { AddWithSessionComposer } from "@/components/AddWithSessionComposer";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";

type Props = {
  searchParams?: Promise<{ session?: string }>;
};

export default async function AddUploadPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const bootstrap = await loadSessionComposerData();
  const initialSessionIds = params.session ? [params.session] : [];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Upload</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Bring existing thinking into the Commons — upload a file (text, PDF,
          DOCX, or audio), or add text. Use Connect to join a Session or
          relate to other elements.
        </p>
      </div>

      <AddWithSessionComposer
        sessions={bootstrap.sessions}
        relateTargets={bootstrap.relateTargets}
        initialSessionIds={initialSessionIds}
        loadError={bootstrap.error}
        mode="upload"
      />
    </div>
  );
}
