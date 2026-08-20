import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPublicProfiles } from "@/lib/comments";
import { trashSchemaError } from "@/lib/trash/schema";
import type { TrashItem } from "@/lib/trash/types";

type DocumentTrashRow = {
  id: string;
  title: string | null;
  type: string | null;
  session_id: string | null;
  deleted_at: string;
  deleted_by: string | null;
};

type SessionTrashRow = {
  id: string;
  name: string;
  deleted_at: string;
  deleted_by: string | null;
};

/**
 * Stream-admin Trash list. Uses the service-role client because RLS hides
 * deleted rows from every member (including admins) so Commons stays clean.
 */
export async function listStreamTrash(
  streamId: string,
): Promise<{ items: TrashItem[]; error: string | null }> {
  try {
    const admin = createAdminClient();

    const [docsResult, sessionsResult] = await Promise.all([
      admin
        .from("documents")
        .select("id, title, type, session_id, deleted_at, deleted_by")
        .eq("stream_id", streamId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      admin
        .from("sessions")
        .select("id, name, deleted_at, deleted_by")
        .eq("stream_id", streamId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);

    if (docsResult.error) {
      return { items: [], error: trashSchemaError(docsResult.error.message) };
    }
    if (sessionsResult.error) {
      return { items: [], error: trashSchemaError(sessionsResult.error.message) };
    }

    const documents = (docsResult.data ?? []) as DocumentTrashRow[];
    const sessions = (sessionsResult.data ?? []) as SessionTrashRow[];

    const sessionIds = [
      ...new Set(
        documents
          .map((doc) => doc.session_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const sessionNames = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data: named } = await admin
        .from("sessions")
        .select("id, name")
        .in("id", sessionIds);
      for (const row of named ?? []) {
        sessionNames.set(String(row.id), String(row.name));
      }
    }

    const actorIds = [
      ...new Set(
        [...documents, ...sessions]
          .map((row) => row.deleted_by)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const { profiles } = await getUserPublicProfiles(actorIds);
    const nameById = new Map(
      profiles.map((profile) => [profile.user_id, profile.display_name]),
    );

    const items: TrashItem[] = [
      ...sessions.map((session) => ({
        kind: "session" as const,
        id: session.id,
        title: session.name.trim() || "Untitled session",
        itemType: "Session",
        deletedAt: session.deleted_at,
        deletedBy: session.deleted_by,
        deletedByName: session.deleted_by
          ? (nameById.get(session.deleted_by) ?? null)
          : null,
        nestedIn: null,
      })),
      ...documents.map((doc) => ({
        kind: "document" as const,
        id: doc.id,
        title: doc.title?.trim() || "Untitled",
        itemType: doc.type?.trim() || "Document",
        deletedAt: doc.deleted_at,
        deletedBy: doc.deleted_by,
        deletedByName: doc.deleted_by
          ? (nameById.get(doc.deleted_by) ?? null)
          : null,
        nestedIn: doc.session_id
          ? (sessionNames.get(doc.session_id) ?? "a session")
          : null,
      })),
    ];

    items.sort((a, b) => {
      const diff =
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime();
      return diff !== 0 ? diff : a.title.localeCompare(b.title);
    });

    return { items, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], error: trashSchemaError(message) };
  }
}
