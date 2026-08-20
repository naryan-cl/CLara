/** Ask CLara answer step only — embeddings stay on platform OpenAI. */
export const ASK_LLM_PROVIDERS = [
  "default",
  "openai",
  "claude",
  "gemini",
] as const;

export type AskLlmProvider = (typeof ASK_LLM_PROVIDERS)[number];

/** Custom providers only — exact API model ids passed to each vendor. */
export type AskLlmCustomProvider = Exclude<AskLlmProvider, "default">;

export type AskLlmModelOption = {
  /** Exact id sent to the provider API. */
  id: string;
  /** Short label for the Admin dropdown. */
  label: string;
  /** Optional one-line note (cost / use case). */
  hint?: string;
};

export const ASK_LLM_MODELS: Record<AskLlmCustomProvider, AskLlmModelOption[]> =
  {
    openai: [
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        hint: "Fast, low cost — platform default",
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        hint: "Stronger answers, higher cost",
      },
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        hint: "Long context, balanced cost",
      },
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        hint: "Higher quality, higher cost",
      },
    ],
    claude: [
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        hint: "Fast, lower cost",
      },
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        hint: "Recommended for grounded Q&A",
      },
      {
        id: "claude-opus-4-6",
        label: "Claude Opus 4.6",
        hint: "Highest quality, highest cost",
      },
    ],
    gemini: [
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        hint: "Cheapest — use a paid API key",
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        hint: "Balanced speed and quality",
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        hint: "Stronger reasoning, higher cost",
      },
    ],
  };

export type AskLlmAdminSettings = {
  provider: AskLlmProvider;
  model: string | null;
  hasApiKey: boolean;
  keyHint: string | null;
};

export type ResolvedAskLlmCredentials = {
  provider: AskLlmProvider;
  apiKey: string;
  model: string;
};

export function isAskLlmProvider(value: string): value is AskLlmProvider {
  return (ASK_LLM_PROVIDERS as readonly string[]).includes(value);
}

export function isAskLlmCustomProvider(
  provider: AskLlmProvider,
): provider is AskLlmCustomProvider {
  return provider !== "default";
}

export function defaultModelForProvider(provider: AskLlmProvider): string {
  switch (provider) {
    case "default":
    case "openai":
      return ASK_LLM_MODELS.openai[0]!.id;
    case "claude":
      return ASK_LLM_MODELS.claude[1]!.id;
    case "gemini":
      return ASK_LLM_MODELS.gemini[1]!.id;
  }
}

export function modelOptionsForProvider(
  provider: AskLlmCustomProvider,
  savedModel?: string | null,
): AskLlmModelOption[] {
  const catalog = ASK_LLM_MODELS[provider];
  const saved = savedModel?.trim();
  if (!saved || catalog.some((option) => option.id === saved)) {
    return catalog;
  }
  return [
    {
      id: saved,
      label: `${saved} (saved — pick a listed model when ready)`,
    },
    ...catalog,
  ];
}

export function isKnownAskModel(
  provider: AskLlmCustomProvider,
  model: string,
): boolean {
  return ASK_LLM_MODELS[provider].some((option) => option.id === model);
}

export function providerLabel(provider: AskLlmProvider): string {
  switch (provider) {
    case "default":
      return "Platform default (OpenAI env)";
    case "openai":
      return "OpenAI";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
  }
}

export function modelLabelForProvider(
  provider: AskLlmCustomProvider,
  modelId: string,
): string {
  const match = ASK_LLM_MODELS[provider].find((option) => option.id === modelId);
  return match ? match.label : modelId;
}
