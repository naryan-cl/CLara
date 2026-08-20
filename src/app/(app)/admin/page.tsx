import { DocumentList } from "@/components/DocumentList";
import { MembersPanel } from "@/components/MembersPanel";
import { IsolationToggle } from "@/components/IsolationToggle";
import { PromptsPanel } from "@/components/PromptsPanel";
import { AskLlmPanel } from "@/components/AskLlmPanel";
import { MapThemesPanel } from "@/components/MapThemesPanel";
import { AskIndexPanel } from "@/components/AskIndexPanel";
import { AdminSection } from "@/components/admin/AdminSection";
import Link from "next/link";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { listNeedsReviewDocuments } from "@/lib/documents/list-needs-review";
import { listStreamMembers } from "@/lib/streams/list-members";
import { getStreamPrompts } from "@/lib/prompts/get-stream-prompts";
import { getStreamThemeSettings } from "@/lib/map-theme/theme-state";
import { listDocumentsMissingEmbeddings } from "@/lib/embeddings/list-missing-embeddings";
import { defaultPromptFor } from "@/lib/prompts/defaults";
import { getStreamAskLlmSettingsForAdmin } from "@/lib/ask/get-stream-ask-llm-settings";
import { canEncryptAskCredentials } from "@/lib/ask/credentials-crypto";
import { providerLabel } from "@/lib/ask/llm-types";
import { getOpenAiChatModel } from "@/lib/openai/env";
import { createClient } from "@/lib/supabase/server";
import { listStreamTrash } from "@/lib/trash/list-stream-trash";
import { TrashPanel } from "@/components/admin/TrashPanel";

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
  const { settings: askLlmSettings, error: askLlmError } =
    await getStreamAskLlmSettingsForAdmin(stream.id);
  const askLlmEncryptionReady = canEncryptAskCredentials();
  const { items: trashItems, error: trashError } = await listStreamTrash(
    stream.id,
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const reflectValue =
    prompts?.reflectEffective ?? defaultPromptFor("reflect");
  const askValue = prompts?.askEffective ?? defaultPromptFor("ask");
  const summarizeValue =
    prompts?.summarizeEffective ?? defaultPromptFor("summarize");
  const synthesizeValue =
    prompts?.synthesizeEffective ?? defaultPromptFor("synthesize");
  const reflectIsCustom = Boolean(prompts?.reflectOverride?.trim());
  const askIsCustom = Boolean(prompts?.askOverride?.trim());
  const summarizeIsCustom = Boolean(prompts?.summarizeOverride?.trim());
  const synthesizeIsCustom = Boolean(prompts?.synthesizeOverride?.trim());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Admin</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Membership, isolation, map themes, Ask index, CLara prompts, Trash,
          and the metadata review queue for {stream.name}. Expand a section to
          edit it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/analytics"
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Analytics →
          </Link>
          <Link
            href="/admin/map-layout"
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Map &amp; Dashboard layout →
          </Link>
          <Link
            href="/admin/export"
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink hover:border-ink/40"
          >
            Export Commons →
          </Link>
        </div>
      </div>

      <AdminSection
        title="Isolation"
        hint={stream.isolation_enabled ? "on" : "off"}
      >
        <IsolationToggle initialEnabled={stream.isolation_enabled} />
      </AdminSection>

      <AdminSection title="Map themes">
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
      </AdminSection>

      <AdminSection
        title="Ask index"
        hint={
          missingEmbeddingsError
            ? undefined
            : missingEmbeddings.length > 0
              ? `${missingEmbeddings.length} not indexed`
              : undefined
        }
      >
        <AskIndexPanel
          documents={missingEmbeddings}
          listError={missingEmbeddingsError}
        />
      </AdminSection>

      <AdminSection
        title="Ask model"
        hint={
          askLlmError
            ? undefined
            : askLlmSettings.provider === "default"
              ? "platform default"
              : providerLabel(askLlmSettings.provider)
        }
        description={
          <>
            Provider and API key for the Ask CLara <strong>answer</strong> step
            on {stream.name}. Commons search still uses the platform OpenAI
            embedding key.
          </>
        }
      >
        {askLlmError ? (
          <p className="font-mono text-sm text-danger">{askLlmError}</p>
        ) : (
          <AskLlmPanel
            initial={askLlmSettings}
            platformChatModel={getOpenAiChatModel()}
            encryptionReady={askLlmEncryptionReady}
          />
        )}
      </AdminSection>

      <AdminSection
        title="CLara prompts"
        description={
          <>
            These are the system instructions Reflect, Ask CLara, and element
            summaries use for {stream.name}. Edits apply immediately to new
            messages and new summaries. Each prompt stays separate — changing
            one never changes the others.
          </>
        }
      >
        {promptsError ? (
          <p className="font-mono text-sm text-danger">{promptsError}</p>
        ) : (
          <PromptsPanel
            reflectValue={reflectValue}
            reflectIsCustom={reflectIsCustom}
            askValue={askValue}
            askIsCustom={askIsCustom}
            summarizeValue={summarizeValue}
            summarizeIsCustom={summarizeIsCustom}
            synthesizeValue={synthesizeValue}
            synthesizeIsCustom={synthesizeIsCustom}
          />
        )}
      </AdminSection>

      <AdminSection
        title="Trash"
        description="Commons Deletes land here instead of disappearing. Restore puts the item back on Commons, Ask, and the map."
        hint={
          trashError
            ? undefined
            : trashItems.length > 0
              ? `${trashItems.length} item${trashItems.length === 1 ? "" : "s"}`
              : undefined
        }
        defaultOpen={Boolean(!trashError && trashItems.length > 0)}
      >
        <TrashPanel items={trashItems} listError={trashError} />
      </AdminSection>

      <AdminSection
        title="Membership"
        hint={
          membersError
            ? undefined
            : members.length > 0
              ? `${members.length} members`
              : undefined
        }
      >
        {membersError ? (
          <p className="font-mono text-sm text-danger">{membersError}</p>
        ) : (
          <MembersPanel members={members} currentUserId={user?.id ?? ""} />
        )}
      </AdminSection>

      <AdminSection
        title="Admin Queue"
        description="Documents the OKF enrichment pass couldn't confidently fill in. Open one, fix Title / Type (and Tags / Participants / Session ID if needed), and save — that clears it from this queue."
        hint={
          error
            ? undefined
            : documents.length > 0
              ? `${documents.length} flagged`
              : undefined
        }
      >
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
      </AdminSection>
    </div>
  );
}
