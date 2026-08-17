import { createClient } from "@/lib/supabase/server";
import {
  defaultPromptFor,
  resolveSystemPrompt,
  type PromptKind,
} from "@/lib/prompts/defaults";

export type StreamPrompts = {
  reflectOverride: string | null;
  askOverride: string | null;
  summarizeOverride: string | null;
  /** Effective text the bots / jobs use (override or default). */
  reflectEffective: string;
  askEffective: string;
  summarizeEffective: string;
};

type PromptRow = {
  reflect_system_prompt?: string | null;
  ask_system_prompt?: string | null;
  summarize_system_prompt?: string | null;
};

function toStreamPrompts(data: PromptRow): StreamPrompts {
  const reflectOverride =
    typeof data.reflect_system_prompt === "string"
      ? data.reflect_system_prompt
      : null;
  const askOverride =
    typeof data.ask_system_prompt === "string"
      ? data.ask_system_prompt
      : null;
  const summarizeOverride =
    typeof data.summarize_system_prompt === "string"
      ? data.summarize_system_prompt
      : null;

  return {
    reflectOverride,
    askOverride,
    summarizeOverride,
    reflectEffective: resolveSystemPrompt("reflect", reflectOverride),
    askEffective: resolveSystemPrompt("ask", askOverride),
    summarizeEffective: resolveSystemPrompt("summarize", summarizeOverride),
  };
}

/**
 * Load per-stream prompt overrides (admin UI + bot call sites).
 * RLS: members can read their stream; admins update via update-stream-prompt.
 */
export async function getStreamPrompts(
  streamId: string,
): Promise<{ prompts: StreamPrompts | null; error: string | null }> {
  const supabase = await createClient();
  const full = await supabase
    .from("streams")
    .select(
      "reflect_system_prompt, ask_system_prompt, summarize_system_prompt",
    )
    .eq("id", streamId)
    .maybeSingle();

  let data: PromptRow | null = full.data;
  let error = full.error;

  // Why: if 0030 is not applied yet, the new column 400s the whole select.
  // Fall back so Reflect/Ask editors still load on the product defaults.
  if (error) {
    const fallback = await supabase
      .from("streams")
      .select("reflect_system_prompt, ask_system_prompt")
      .eq("id", streamId)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { prompts: null, error: error.message };
  }
  if (!data) {
    return { prompts: null, error: "Stream not found." };
  }

  return { prompts: toStreamPrompts(data), error: null };
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

  const prompt =
    kind === "reflect"
      ? prompts.reflectEffective
      : kind === "ask"
        ? prompts.askEffective
        : prompts.summarizeEffective;

  return { prompt, error: null };
}
