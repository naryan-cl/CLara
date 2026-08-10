import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve display names for people on the linked session(s).
 * Used to seed document.participants and to rename diarized Speaker A/B labels.
 */
export async function resolveSessionParticipantNames(
  sessionIds: string[],
  client?: SupabaseClient,
): Promise<string[]> {
  const ids = [...new Set(sessionIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const supabase = client ?? (await createClient());

  const { data: attendees, error: attendeeError } = await supabase
    .from("session_attendees")
    .select("user_id")
    .in("session_id", ids);

  if (attendeeError) {
    console.error("resolveSessionParticipantNames attendees:", attendeeError);
    return [];
  }

  const userIds = [
    ...new Set((attendees ?? []).map((row) => row.user_id as string)),
  ];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase.rpc(
    "get_user_public_profiles",
    { p_user_ids: userIds },
  );

  if (profileError) {
    console.error("resolveSessionParticipantNames profiles:", profileError);
    return [];
  }

  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of (profiles ?? []) as Array<{
    display_name: string | null;
    email: string | null;
  }>) {
    const name =
      (row.display_name ?? "").trim() ||
      (row.email ?? "").split("@")[0]?.trim() ||
      "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** Normalize jsonb participants from a documents row into display-name strings. */
export function asParticipantNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
