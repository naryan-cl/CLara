import { createClient } from "@/lib/supabase/server";
import {
  bothLayoutsAreDefault,
  parseStreamMapLayouts,
  type MapLayoutConfig,
  type MapLayoutSurface,
  type StreamMapLayouts,
} from "@/lib/graph/map-layout-config";

function missingColumn(error: { message: string; code?: string }): boolean {
  return (
    error.message.includes("map_layout_config") ||
    error.code === "42703" ||
    error.code === "PGRST204"
  );
}

/** Load both surface overrides (or product defaults if NULL / missing column). */
export async function getStreamMapLayouts(
  streamId: string,
): Promise<{ layouts: StreamMapLayouts; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streams")
    .select("map_layout_config")
    .eq("id", streamId)
    .maybeSingle();

  if (error) {
    if (missingColumn(error)) {
      return { layouts: parseStreamMapLayouts(null), error: null };
    }
    return { layouts: parseStreamMapLayouts(null), error: error.message };
  }

  return {
    layouts: parseStreamMapLayouts(data?.map_layout_config ?? null),
    error: null,
  };
}

/** Load knobs for one surface. Default = Knowledge Map (`/map`). */
export async function getStreamMapLayoutConfig(
  streamId: string,
  surface: MapLayoutSurface = "knowledgeMap",
): Promise<{ config: MapLayoutConfig; error: string | null }> {
  const { layouts, error } = await getStreamMapLayouts(streamId);
  return { config: layouts[surface], error };
}

export async function updateStreamMapLayouts(
  streamId: string,
  layouts: StreamMapLayouts | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const payload =
    layouts == null || bothLayoutsAreDefault(layouts)
      ? null
      : {
          knowledgeMap: layouts.knowledgeMap,
          dashboard: layouts.dashboard,
        };
  const { error } = await supabase
    .from("streams")
    .update({
      map_layout_config: payload,
    })
    .eq("id", streamId);

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
