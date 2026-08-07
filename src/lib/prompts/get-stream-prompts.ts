import { createClient } from "@/lib/supabase/server";
import {
  defaultPromptFor,
  resolveSystemPrompt,
  type PromptKind,
} from "@/lib/prompts/defaults";

export type StreamPrompts = {
  reflectOverride: string | null;
  askOverride: string | null;
  /** Effective text the bots use (override or default). */
  reflectEffective: string;
  askEffective: string;
};

/**
 * Load per-stream prompt overrides (admin UI + bot call sites).
 * RLS: members can read their stream; admins update via update-stream-prompt.
 */
export async function getStreamPrompts(
  streamId: string,
): Promise<{ prompts: StreamPrompts | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streams")
    .select("reflect_system_prompt, ask_system_prompt")
    .eq("id", streamId)
    .maybeSingle();

  if (error) {
    return { prompts: null, error: error.message };
  }
  if (!data) {
    return { prompts: null, error: "Stream not found." };
  }

  const reflectOverride =
    typeof data.reflect_system_prompt === "string"
      ? data.reflect_system_prompt
      : null;
  const askOverride =
    typeof data.ask_system_prompt === "string"
      ? data.ask_system_prompt
      : null;

  return {
    prompts: {
      reflectOverride,
      askOverride,
      reflectEffective: resolveSystemPrompt("reflect", reflectOverride),
      askEffective: resolveSystemPrompt("ask", askOverride),
    },
    error: null,
  };
}

export async function getEffectiveSystemPrompt(
  streamId: string,
  kind: PromptKind,
): Promise<{ prompt: string; error: string | null }> {
  const { prompts, error } = await getStreamPrompts(streamId);
  if (error || !prompts) {
    // Fail soft: bots keep working on product defaults if the read fails.
    console.error("getEffectiveSystemPrompt:", error ?? "no prompts");
    return { prompt: defaultPromptFor(kind), error: error };
  }
  return {
    prompt: kind === "reflect" ? prompts.reflectEffective : prompts.askEffective,
    error: null,
  };
}
