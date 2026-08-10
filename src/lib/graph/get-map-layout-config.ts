import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_MAP_LAYOUT_CONFIG,
  parseMapLayoutConfig,
  type MapLayoutConfig,
} from "@/lib/graph/map-layout-config";

/** Load stream map layout overrides (or product defaults if NULL / missing column). */
export async function getStreamMapLayoutConfig(
  streamId: string,
): Promise<{ config: MapLayoutConfig; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streams")
    .select("map_layout_config")
    .eq("id", streamId)
    .maybeSingle();

  if (error) {
    // Column missing until migration 0022 is applied — fail soft to defaults.
    if (
      error.message.includes("map_layout_config") ||
      error.code === "42703" ||
      error.code === "PGRST204"
    ) {
      return { config: DEFAULT_MAP_LAYOUT_CONFIG, error: null };
    }
    return { config: DEFAULT_MAP_LAYOUT_CONFIG, error: error.message };
  }

  return {
    config: parseMapLayoutConfig(data?.map_layout_config ?? null),
    error: null,
  };
}

export async function updateStreamMapLayoutConfig(
  streamId: string,
  config: MapLayoutConfig | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("streams")
    .update({
      map_layout_config: config,
    })
    .eq("id", streamId);

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
