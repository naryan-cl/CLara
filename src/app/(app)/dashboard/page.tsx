import { listCommonsItems } from "@/lib/commons/list-items";
import { listDocumentLinks } from "@/lib/documents/list-document-links";
import { listSessionRelations } from "@/lib/sessions/list-session-relations";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getThemeUnlockState } from "@/lib/map-theme/theme-state";
import { getStreamMapLayoutConfig } from "@/lib/graph/get-map-layout-config";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

type Props = {
  searchParams?: Promise<{ select?: string; fresh?: string }>;
};

function parseSelectParam(
  raw: string | undefined,
): { kind: "document" | "session"; id: string } | null {
  if (!raw) return null;
  const match = /^(document|session):([0-9a-f-]{36})$/i.exec(raw.trim());
  if (!match) return null;
  return {
    kind: match[1]!.toLowerCase() as "document" | "session",
    id: match[2]!,
  };
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const initialSelect = parseSelectParam(params.select);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { stream } = await getActiveStream();
  const { items, error: commonsError } =
    stream && user
      ? await listCommonsItems(stream.id, user.id)
      : { items: [], error: null };

  const { links: documentLinks } =
    stream && user
      ? await listDocumentLinks(stream.id)
      : { links: [] };

  const { relations: sessionRelations } =
    stream && user
      ? await listSessionRelations(stream.id)
      : { relations: [] };

  const themeResult =
    stream && user
      ? await getThemeUnlockState(stream.id, user.id)
      : { state: null, error: null };

  const layoutResult = stream
    ? await getStreamMapLayoutConfig(stream.id, "dashboard")
    : { config: null, error: null };

  if (!stream || !user) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[var(--clara-header-height)] flex items-center justify-center bg-forest-deep p-8">
        <div className="organic-ask max-w-md border border-cloud/80 bg-paper/95 p-6 shadow-soft">
          <p className="text-sm text-ink/70">
            Join a stream to explore its Commons and add contributions.
          </p>
          <p className="mt-3 text-sm text-ink/55">
            Ask CLara needs an active stream.
          </p>
        </div>
      </div>
    );
  }

  const themeError = themeResult.error;
  const state = themeResult.state;
  const mapTheme = state?.activeTheme ?? "plant";
  const unlockedThemes = state?.unlocked ?? ["plant"];
  const pendingUnlock =
    state?.pendingUnlockPopup === "ocean" ||
    state?.pendingUnlockPopup === "desert"
      ? state.pendingUnlockPopup
      : null;

  // Theme settings require 0017 — fail soft to Plant so Commons still loads.
  if (themeError) {
    console.warn("[dashboard] theme state unavailable:", themeError);
  }

  return (
    <DashboardGrid
      items={items}
      streamId={stream.id}
      streamName={stream.name}
      currentUserId={user.id}
      error={commonsError}
      mapTheme={mapTheme}
      unlockedThemes={unlockedThemes}
      pendingUnlock={pendingUnlock}
      initialSelect={initialSelect}
      layoutConfig={layoutResult.config ?? undefined}
      documentLinks={documentLinks}
      sessionRelations={sessionRelations}
    />
  );
}
