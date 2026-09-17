import { ReflectPageClient } from "@/components/ReflectPageClient";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";
import { getAccessContext } from "@/lib/access/get-access-context";

type Props = {
  searchParams?: Promise<{ session?: string }>;
};

export default async function AddReflectPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const initialSessionIds = params.session ? [params.session] : [];
  const bootstrap = await loadSessionComposerData(params.session);
  const access = await getAccessContext();

  return (
    <ReflectPageClient
      sessions={bootstrap.sessions}
      relateTargets={bootstrap.relateTargets}
      initialSessionIds={initialSessionIds}
      loadError={bootstrap.error}
      guestMode={access.kind === "guest" || access.kind === "link_guest"}
    />
  );
}
