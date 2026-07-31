import { createClient } from "@/lib/supabase/server";

export async function updateStreamIsolation(
  streamId: string,
  isolationEnabled: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("streams")
    .update({ isolation_enabled: isolationEnabled })
    .eq("id", streamId);

  return { error: error?.message ?? null };
}
