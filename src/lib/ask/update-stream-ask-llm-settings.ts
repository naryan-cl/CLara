import { createAdminClient } from "@/lib/supabase/admin";
import {
  canEncryptAskCredentials,
  encryptAskApiKey,
} from "@/lib/ask/credentials-crypto";
import {
  defaultModelForProvider,
  isAskLlmProvider,
  isKnownAskModel,
  type AskLlmProvider,
} from "@/lib/ask/llm-types";

const MAX_MODEL_CHARS = 120;
const MAX_API_KEY_CHARS = 512;

export type SaveAskLlmInput = {
  provider: AskLlmProvider;
  /** Empty string = keep existing key. Whitespace-only with clearKey = remove. */
  apiKey: string;
  clearKey: boolean;
  model: string;
};

/**
 * Persist Ask answer-model settings. Uses the admin client because the table
 * has no RLS policies (secrets must not be readable by stream members).
 */
export async function saveStreamAskLlmSettings(
  streamId: string,
  input: SaveAskLlmInput,
): Promise<{ error: string | null }> {
  if (!isAskLlmProvider(input.provider)) {
    return { error: "Unknown provider." };
  }

  const modelTrimmed = input.model.trim();
  if (modelTrimmed.length > MAX_MODEL_CHARS) {
    return {
      error: `Model name is too long (max ${MAX_MODEL_CHARS} characters).`,
    };
  }

  if (input.provider !== "default") {
    if (!modelTrimmed) {
      return { error: "Choose a model from the list." };
    }
    if (!isKnownAskModel(input.provider, modelTrimmed)) {
      return {
        error: "Unknown model for this provider — pick one from the dropdown.",
      };
    }
  }

  const admin = createAdminClient();

  if (input.provider === "default") {
    const { error } = await admin.from("stream_ask_llm_settings").upsert(
      {
        stream_id: streamId,
        provider: "default",
        api_key_ciphertext: null,
        model: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stream_id" },
    );
    return { error: error?.message ?? null };
  }

  if (!canEncryptAskCredentials()) {
    return {
      error:
        "Server missing ASK_LLM_CREDENTIALS_KEY — set it in Vercel / .env.local before saving custom API keys.",
    };
  }

  const { data: existing, error: loadError } = await admin
    .from("stream_ask_llm_settings")
    .select("provider, api_key_ciphertext")
    .eq("stream_id", streamId)
    .maybeSingle();

  if (loadError) {
    return { error: loadError.message };
  }

  const apiKeyInput = input.apiKey.trim();
  let ciphertext: string | null = existing?.api_key_ciphertext ?? null;

  const providerChanged =
    existing?.provider &&
    existing.provider !== input.provider &&
    existing.provider !== "default";

  if (input.clearKey) {
    ciphertext = null;
  } else if (apiKeyInput.length > 0) {
    if (apiKeyInput.length > MAX_API_KEY_CHARS) {
      return { error: "API key is too long." };
    }
    ciphertext = encryptAskApiKey(apiKeyInput);
    if (!ciphertext) {
      return { error: "Could not encrypt the API key." };
    }
  } else if (providerChanged) {
    return {
      error: "Enter an API key for the new provider (the saved key belongs to the previous one).",
    };
  }

  if (!ciphertext) {
    return {
      error: "Enter an API key for this provider, or choose Platform default.",
    };
  }

  const storedModel =
    modelTrimmed.length > 0
      ? modelTrimmed
      : defaultModelForProvider(input.provider);

  const { error } = await admin.from("stream_ask_llm_settings").upsert(
    {
      stream_id: streamId,
      provider: input.provider,
      api_key_ciphertext: ciphertext,
      model: storedModel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stream_id" },
  );

  return { error: error?.message ?? null };
}

/** Remove custom provider/key and revert to platform OpenAI env. */
export async function resetStreamAskLlmSettings(
  streamId: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("stream_ask_llm_settings")
    .delete()
    .eq("stream_id", streamId);

  return { error: error?.message ?? null };
}
