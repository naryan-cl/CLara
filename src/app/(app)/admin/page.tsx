import { DocumentList } from "@/components/DocumentList";
import { MembersPanel } from "@/components/MembersPanel";
import { IsolationToggle } from "@/components/IsolationToggle";
import { PromptsPanel } from "@/components/PromptsPanel";
import { MapThemesPanel } from "@/components/MapThemesPanel";
import { AskIndexPanel } from "@/components/AskIndexPanel";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listNeedsReviewDocuments } from "@/lib/documents/list-needs-review";
import { listStreamMembers } from "@/lib/streams/list-members";
import { getStreamPrompts } from "@/lib/prompts/get-stream-prompts";
import { getStreamThemeSettings } from "@/lib/map-theme/theme-state";
import { listDocumentsMissingEmbeddings } from "@/lib/embeddings/list-missing-embeddings";
import { defaultPromptFor } from "@/lib/prompts/defaults";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          No active stream — join a stream to see its Admin Queue.
        </p>
      </div>
    );
  }

  if (stream.role !== "admin") {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Admin Queue is only visible to admins of {stream.name}.
        </p>
      </div>
    );
  }

  const { documents, error } = await listNeedsReviewDocuments(stream.id);
  const { members, error: membersError } = await listStreamMembers(stream.id);
  const { prompts, error: promptsError } = await getStreamPrompts(stream.id);
  const { settings: themeSettings, error: themeError } =
    await getStreamThemeSettings(stream.id);
  const {
    documents: missingEmbeddings,
    error: missingEmbeddingsError,
  } = await listDocumentsMissingEmbeddings(stream.id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const reflectValue =
    prompts?.reflectEffective ?? defaultPromptFor("reflect");
  const askValue = prompts?.askEffective ?? defaultPromptFor("ask");
  const reflectIsCustom = Boolean(prompts?.reflectOverride?.trim());
  const askIsCustom = Boolean(prompts?.askOverride?.trim());

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Membership, isolation, map themes, Ask index, CLara prompts, and the
          metadata review queue for {stream.name}.
        </p>
      </div>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Isolation
        </h2>
        <div className="mt-4">
          <IsolationToggle initialEnabled={stream.isolation_enabled} />
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Map themes
        </h2>
        <div className="mt-4">
          {themeError || !themeSettings ? (
            <p className="font-mono text-sm text-danger">
              {themeError ??
                "Theme settings unavailable — apply migration 0017_map_themes."}
            </p>
          ) : (
            <MapThemesPanel
              key={`${themeSettings.defaultMapTheme}-${themeSettings.oceanUnlockAt}-${themeSettings.desertUnlockAt}`}
              initialDefaultTheme={themeSettings.defaultMapTheme}
              initialOceanUnlockAt={themeSettings.oceanUnlockAt}
              initialDesertUnlockAt={themeSettings.desertUnlockAt}
            />
          )}
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Ask index
        </h2>
        <div className="mt-4">
          <AskIndexPanel
            documents={missingEmbeddings}
            listError={missingEmbeddingsError}
          />
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          CLara prompts
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          These are the system instructions Reflect and Ask CLara use for{" "}
          {stream.name}. Edits apply immediately to new messages. Reflect and
          Ask stay separate — changing one never changes the other.
        </p>
        <div className="mt-4">
          {promptsError ? (
            <p className="font-mono text-sm text-danger">{promptsError}</p>
          ) : (
            <PromptsPanel
              reflectValue={reflectValue}
              reflectIsCustom={reflectIsCustom}
              askValue={askValue}
              askIsCustom={askIsCustom}
            />
          )}
        </div>
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Membership
        </h2>
        {membersError ? (
          <p className="mt-3 font-mono text-sm text-danger">
            {membersError}
          </p>
        ) : (
          <div className="mt-4">
            <MembersPanel members={members} currentUserId={user?.id ?? ""} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <h2 className="font-display text-lg font-medium text-ink">
          Admin Queue
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Documents the OKF enrichment pass couldn&apos;t confidently fill in.
          Open one, fix Title / Type (and Tags / Participants / Session ID if
          needed), and save — that clears it from this queue.
        </p>
        <div className="mt-4">
          {error ? (
            <p className="font-mono text-sm text-danger">{error}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-ink/60">
              Nothing flagged right now — every document in {stream.name} has
              enough metadata.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
                {documents.length} flagged
              </p>
              <DocumentList documents={documents} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
