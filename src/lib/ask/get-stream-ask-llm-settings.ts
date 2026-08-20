import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptAskApiKey,
  keyHintFromPlaintext,
} from "@/lib/ask/credentials-crypto";
import { getOpenAiApiKey, getOpenAiChatModel } from "@/lib/openai/env";
import {
  defaultModelForProvider,
  isAskLlmProvider,
  type AskLlmAdminSettings,
  type AskLlmProvider,
  type ResolvedAskLlmCredentials,
} from "@/lib/ask/llm-types";

type SettingsRow = {
  provider: string;
  api_key_ciphertext: string | null;
  model: string | null;
};

async function loadSettingsRow(
  streamId: string,
): Promise<{ row: SettingsRow | null; error: string | null }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stream_ask_llm_settings")
      .select("provider, api_key_ciphertext, model")
      .eq("stream_id", streamId)
      .maybeSingle();

    if (error) {
      if (error.message.includes("stream_ask_llm_settings")) {
        return {
          row: null,
          error:
            "Ask model settings unavailable — apply migration 0034_stream_ask_llm_settings.sql.",
        };
      }
      return { row: null, error: error.message };
    }

    return { row: data as SettingsRow | null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { row: null, error: message };
  }
}

function normalizeProvider(raw: string | null | undefined): AskLlmProvider {
  if (raw && isAskLlmProvider(raw)) return raw;
  return "default";
}

/** Admin UI metadata — never returns the full API key. */
export async function getStreamAskLlmSettingsForAdmin(
  streamId: string,
): Promise<{ settings: AskLlmAdminSettings; error: string | null }> {
  const { row, error } = await loadSettingsRow(streamId);
  if (error) {
    return {
      settings: {
        provider: "default",
        model: null,
        hasApiKey: false,
        keyHint: null,
      },
      error,
    };
  }

  if (!row) {
    return {
      settings: {
        provider: "default",
        model: null,
        hasApiKey: false,
        keyHint: null,
      },
      error: null,
    };
  }

  const provider = normalizeProvider(row.provider);
  const ciphertext = row.api_key_ciphertext?.trim() ?? "";
  let keyHint: string | null = null;
  if (ciphertext && provider !== "default") {
    const plain = decryptAskApiKey(ciphertext);
    keyHint = plain ? keyHintFromPlaintext(plain) : "????";
  }

  return {
    settings: {
      provider,
      model: row.model?.trim() || null,
      hasApiKey: Boolean(ciphertext && provider !== "default"),
      keyHint,
    },
    error: null,
  };
}

/**
 * Resolve credentials for the Ask answer step.
 * `default` and missing rows use platform OPENAI_* env vars.
 */
export async function resolveAskLlmCredentials(
  streamId: string,
): Promise<{ credentials: ResolvedAskLlmCredentials | null; error: string | null }> {
  const { row, error } = await loadSettingsRow(streamId);
  if (error) {
    return { credentials: null, error };
  }

  const provider = normalizeProvider(row?.provider);
  if (!row || provider === "default") {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return {
        credentials: null,
        error: "Ask CLara isn't configured yet (missing OPENAI_API_KEY).",
      };
    }
    return {
      credentials: {
        provider: "default",
        apiKey,
        model: getOpenAiChatModel(),
      },
      error: null,
    };
  }

  const ciphertext = row.api_key_ciphertext?.trim();
  if (!ciphertext) {
    return {
      credentials: null,
      error: `Ask CLara is set to ${provider} but no API key is saved. Add one in Admin → Ask model.`,
    };
  }

  const apiKey = decryptAskApiKey(ciphertext);
  if (!apiKey) {
    return {
      credentials: null,
      error:
        "Could not read the saved Ask API key — check ASK_LLM_CREDENTIALS_KEY on the server.",
    };
  }

  const model =
    row.model?.trim() || defaultModelForProvider(provider);

  return {
    credentials: { provider, apiKey, model },
    error: null,
  };
}
