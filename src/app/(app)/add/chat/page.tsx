import { ReflectPageClient } from "@/components/ReflectPageClient";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";

type Props = {
  searchParams?: Promise<{ session?: string }>;
};

export default async function AddReflectPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const bootstrap = await loadSessionComposerData();
  const initialSessionIds = params.session ? [params.session] : [];

  return (
    <ReflectPageClient
      sessions={bootstrap.sessions}
      peers={bootstrap.peers}
      initialSessionIds={initialSessionIds}
      loadError={bootstrap.error}
    />
  );
}
