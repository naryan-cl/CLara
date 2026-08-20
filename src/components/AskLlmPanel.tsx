"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetStreamAskLlmSettings,
  saveStreamAskLlmSettings,
} from "@/app/(app)/admin/actions";
import {
  ASK_LLM_PROVIDERS,
  defaultModelForProvider,
  isAskLlmCustomProvider,
  modelOptionsForProvider,
  providerLabel,
  type AskLlmAdminSettings,
  type AskLlmProvider,
} from "@/lib/ask/llm-types";

type AskLlmPanelProps = {
  initial: AskLlmAdminSettings;
  /** Resolved platform default when Admin uses "Platform default". */
  platformChatModel: string;
  encryptionReady: boolean;
};

export function AskLlmPanel({
  initial,
  platformChatModel,
  encryptionReady,
}: AskLlmPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [provider, setProvider] = useState<AskLlmProvider>(initial.provider);
  const [model, setModel] = useState(
    () => initial.model ?? defaultModelForProvider(initial.provider),
  );
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setProvider(initial.provider);
    setModel(initial.model ?? defaultModelForProvider(initial.provider));
    setApiKey("");
  }, [initial]);

  const usesCustomProvider = provider !== "default";

  const modelOptions = useMemo(() => {
    if (!isAskLlmCustomProvider(provider)) return [];
    return modelOptionsForProvider(
      provider,
      initial.provider === provider ? initial.model : null,
    );
  }, [provider, initial.provider, initial.model]);

  const dirty =
    provider !== initial.provider ||
    model !== (initial.model ?? defaultModelForProvider(initial.provider)) ||
    apiKey.length > 0;

  function onProviderChange(next: AskLlmProvider) {
    setProvider(next);
    setSavedNote(null);
    setModel(defaultModelForProvider(next));
  }

  function onSave() {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const result = await saveStreamAskLlmSettings({
        provider,
        apiKey,
        clearKey: false,
        model: usesCustomProvider ? model : "",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey("");
      setSavedNote("Saved.");
      router.refresh();
    });
  }

  function onReset() {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const result = await resetStreamAskLlmSettings();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProvider("default");
      setModel(defaultModelForProvider("default"));
      setApiKey("");
      setSavedNote("Reset to platform default.");
      router.refresh();
    });
  }

  const isCustom = initial.provider !== "default" || initial.hasApiKey;
  const selectedModelOption = modelOptions.find((option) => option.id === model);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-xs text-ink/50">
        Choose which model answers Ask CLara after Commons search. Retrieval
        (embeddings) always uses the platform{" "}
        <span className="font-mono">OPENAI_API_KEY</span> — only the final
        answer step uses this setting. Model names must match the provider API
        exactly; pick from the list below.
      </p>

      {!encryptionReady ? (
        <div className="rounded-md border border-cloud bg-sand px-3 py-3 text-sm text-ink/70">
          <p className="font-medium text-ink">
            Custom API keys need a server encryption secret
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
            <li>
              In a terminal at the project root, run:{" "}
              <code className="rounded bg-paper px-1 py-0.5 font-mono text-[11px]">
                node -e
                &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;
              </code>
            </li>
            <li>
              Copy the 64-character hex string (do not share it or commit it).
            </li>
            <li>
              Local: add{" "}
              <code className="font-mono text-[11px]">ASK_LLM_CREDENTIALS_KEY=</code>
              that value to <code className="font-mono text-[11px]">.env.local</code>,
              then restart <code className="font-mono text-[11px]">npm run dev</code>.
            </li>
            <li>
              Production: Vercel → Project → Settings → Environment Variables →
              add the same name/value for Production (and Preview if you test
              there) → redeploy.
            </li>
          </ol>
          <p className="mt-2 text-xs text-ink/55">
            Platform default (OpenAI env) works without this key. The key only
            encrypts optional per-stream keys saved here — it is not sent to
            OpenAI, Claude, or Gemini.
          </p>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-base font-medium text-ink">
          Provider
        </legend>
        {ASK_LLM_PROVIDERS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-2 text-sm text-ink/80"
          >
            <input
              type="radio"
              name="ask-llm-provider"
              value={value}
              checked={provider === value}
              disabled={pending}
              onChange={() => onProviderChange(value)}
              className="mt-0.5"
            />
            <span>{providerLabel(value)}</span>
          </label>
        ))}
      </fieldset>

      {usesCustomProvider ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-llm-model"
              className="font-mono text-[11px] uppercase tracking-wide text-ink/40"
            >
              Model
            </label>
            <select
              id="ask-llm-model"
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                setSavedNote(null);
              }}
              disabled={pending}
              className="w-full max-w-md rounded-md border border-cloud bg-sand px-3 py-2 text-sm text-ink disabled:opacity-60"
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {selectedModelOption?.hint ? (
              <p className="text-xs text-ink/45">{selectedModelOption.hint}</p>
            ) : null}
            <p className="font-mono text-[10px] text-ink/35">
              API id: {model}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-llm-api-key"
              className="font-mono text-[11px] uppercase tracking-wide text-ink/40"
            >
              API key
            </label>
            <input
              id="ask-llm-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSavedNote(null);
              }}
              disabled={pending || !encryptionReady}
              autoComplete="off"
              placeholder={
                initial.hasApiKey && initial.provider === provider
                  ? `Saved (…${initial.keyHint ?? "????"}) — leave blank to keep`
                  : "Paste API key"
              }
              className="w-full max-w-md rounded-md border border-cloud bg-sand px-3 py-2 font-mono text-sm text-ink disabled:opacity-60"
            />
            <p className="text-xs text-ink/45">
              Keys are encrypted at rest and never shown again after save. Use
              paid API tiers for production Commons data.
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink/60">
          Using{" "}
          <span className="font-mono text-ink/80">OPENAI_API_KEY</span> with
          model{" "}
          <span className="font-mono text-ink/80">{platformChatModel}</span>{" "}
          (<span className="font-mono text-[11px]">OPENAI_CHAT_MODEL</span> or
          built-in default).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="btn-primary rounded-md bg-forest px-3 py-1.5 text-sm text-paper transition disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={pending || (!isCustom && provider === "default" && !dirty)}
          className="rounded-md border border-cloud bg-paper px-3 py-1.5 text-sm text-ink transition hover:bg-sand disabled:opacity-50"
        >
          Reset to platform default
        </button>
        {savedNote ? (
          <span className="text-xs text-ink/60">{savedNote}</span>
        ) : null}
      </div>

      {error ? (
        <p className="font-mono text-xs text-danger">{error}</p>
      ) : null}
    </div>
  );
}
