import OpenAI from "openai";
import type { AskHistoryMessage } from "@/app/(app)/ask/actions";
import type { AskLlmProvider } from "@/lib/ask/llm-types";

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

const MAX_OUTPUT_TOKENS = 4096;

type CompleteAskChatInput = {
  provider: AskLlmProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: AskHistoryMessage[];
  userMessage: string;
};

function openAiCompatibleClient(
  provider: AskLlmProvider,
  apiKey: string,
): OpenAI {
  if (provider === "gemini") {
    return new OpenAI({ apiKey, baseURL: GEMINI_OPENAI_BASE_URL });
  }
  return new OpenAI({ apiKey });
}

async function completeViaOpenAiCompatible(
  input: CompleteAskChatInput,
): Promise<string | null> {
  const client = openAiCompatibleClient(input.provider, input.apiKey);
  const completion = await client.chat.completions.create({
    model: input.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.history.map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
      { role: "user", content: input.userMessage },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? null;
}

async function completeViaClaude(
  input: CompleteAskChatInput,
): Promise<string | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: input.systemPrompt,
      messages: [
        ...input.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: input.userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      body.slice(0, 240) || `Claude HTTP ${response.status}`,
    );
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };

  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  return text || null;
}

function providerErrorMessage(provider: AskLlmProvider, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  switch (provider) {
    case "claude":
      return `Claude could not answer (${detail}). Check the API key and model name in Admin → Ask model.`;
    case "gemini":
      return `Gemini could not answer (${detail}). Use a paid Gemini API key and check the model name.`;
    case "openai":
    case "default":
    default:
      return `OpenAI could not answer (${detail}). Check the API key and model name.`;
  }
}

/**
 * Grounded Ask answer — one shot with system prompt, prior turns, and RAG context.
 */
export async function completeAskChat(
  input: CompleteAskChatInput,
): Promise<{ content: string } | { error: string }> {
  try {
    const content =
      input.provider === "claude"
        ? await completeViaClaude(input)
        : await completeViaOpenAiCompatible(input);

    if (!content) {
      return {
        error: "CLara didn't return an answer — try again.",
      };
    }

    return { content };
  } catch (err) {
    console.error("completeAskChat failed:", err);
    return {
      error: providerErrorMessage(input.provider, err),
    };
  }
}
