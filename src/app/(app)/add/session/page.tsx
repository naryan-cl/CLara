import { redirect } from "next/navigation";
import { loadSessionComposerData } from "@/app/(app)/sessions/composer-actions";
import { SessionLiveBoard } from "@/components/SessionLiveBoard";
import { getAccessContext } from "@/lib/access/get-access-context";

type Props = {
  searchParams: Promise<{ id?: string }>;
};

export default async function AddSessionPage({ searchParams }: Props) {
  const access = await getAccessContext();
  if (access.kind === "guest" || access.kind === "link_guest") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const { peers, error } = await loadSessionComposerData();

  return (
    <div className="px-4 py-8 sm:px-6">
      <SessionLiveBoard
        peers={peers}
        initialSessionId={params.id ?? null}
        loadError={error}
      />
    </div>
  );
}
