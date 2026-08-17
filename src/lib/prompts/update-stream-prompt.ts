import { createClient } from "@/lib/supabase/server";
import {
  MAX_SYSTEM_PROMPT_CHARS,
  PROMPT_COLUMNS,
  defaultPromptFor,
  type PromptKind,
} from "@/lib/prompts/defaults";

/**
 * Save or clear a stream system-prompt override.
 * Pass `null` (or whitespace-only) to reset to the product default.
 * Saving text identical to the product default also clears the override.
 * RLS: only stream admins can UPDATE streams (0007).
 */
export async function updateStreamPrompt(
  streamId: string,
  kind: PromptKind,
  value: string | null,
): Promise<{ error: string | null }> {
  const trimmed = value?.trim() ?? "";
  const column = PROMPT_COLUMNS[kind];

  if (trimmed.length > MAX_SYSTEM_PROMPT_CHARS) {
    return {
      error: `Prompt is too long (max ${MAX_SYSTEM_PROMPT_CHARS} characters).`,
    };
  }

  // Empty / whitespace / exact default → NULL so resolve uses the code default.
  const stored: string | null =
    trimmed.length > 0 && trimmed !== defaultPromptFor(kind) ? trimmed : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("streams")
    .update({ [column]: stored })
    .eq("id", streamId);

  return { error: error?.message ?? null };
}
