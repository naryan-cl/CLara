import { createClient } from "@/lib/supabase/server";
import type { SessionSummary } from "@/lib/sessions/types";

export async function getSessionById(
  id: string,
): Promise<{ session: SessionSummary | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, stream_id, name, occurred_at, created_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { session: null, error: error.message };
  }

  return { session: (data as SessionSummary | null) ?? null, error: null };
}
