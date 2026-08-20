"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveStreamPrompt,
  resetStreamPrompt,
} from "@/app/(app)/admin/actions";
import {
  MAX_SYSTEM_PROMPT_CHARS,
  type PromptKind,
} from "@/lib/prompts/defaults";

type PromptEditorProps = {
  kind: PromptKind;
  label: string;
  description: string;
  /** Effective text currently shown (override or default). */
  initialValue: string;
  /** True when a DB override is stored (not the product default). */
  isCustom: boolean;
  rows?: number;
};

function PromptEditor({
  kind,
  label,
  description,
  initialValue,
  isCustom,
  rows = 8,
}: PromptEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // After save/reset, the server re-renders with new props — keep the textarea in sync.
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const dirty = value !== initialValue;

  function onSave() {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const result = await saveStreamPrompt(kind, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedNote("Saved.");
      router.refresh();
    });
  }

  function onReset() {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const result = await resetStreamPrompt(kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedNote("Reset to product default.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="font-display text-base font-medium text-ink">{label}</h3>
        <p className="mt-1 max-w-2xl text-xs text-ink/50">{description}</p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-ink/40">
          {isCustom ? "Custom override" : "Product default"}
          {dirty ? " · unsaved edits" : ""}
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSavedNote(null);
        }}
        rows={rows}
        maxLength={MAX_SYSTEM_PROMPT_CHARS}
        disabled={pending}
        className="w-full rounded-md border border-cloud bg-sand px-3 py-2 font-mono text-sm leading-relaxed text-ink disabled:opacity-60"
        spellCheck={false}
      />
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
          disabled={pending || (!isCustom && !dirty)}
          className="rounded-md border border-cloud bg-paper px-3 py-1.5 text-sm text-ink transition hover:bg-sand disabled:opacity-50"
        >
          Reset to default
        </button>
        <span className="font-mono text-[11px] text-ink/40">
          {value.length}/{MAX_SYSTEM_PROMPT_CHARS}
        </span>
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

export function PromptsPanel({
  reflectValue,
  reflectIsCustom,
  askValue,
  askIsCustom,
  summarizeValue,
  summarizeIsCustom,
  synthesizeValue,
  synthesizeIsCustom,
}: {
  reflectValue: string;
  reflectIsCustom: boolean;
  askValue: string;
  askIsCustom: boolean;
  summarizeValue: string;
  summarizeIsCustom: boolean;
  synthesizeValue: string;
  synthesizeIsCustom: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PromptEditor
        kind="reflect"
        label="Reflect"
        description="Instructions for the one-on-one reflection conversation on Add → Reflect. This bot has no access to the Commons — keep that boundary clear if you edit."
        initialValue={reflectValue}
        isCustom={reflectIsCustom}
      />
      <PromptEditor
        kind="ask"
        label="Ask CLara"
        description="Instructions for grounded Q&A over the Commons on Synthesis → Ask. This bot should answer only from retrieved excerpts — keep that boundary clear if you edit."
        initialValue={askValue}
        isCustom={askIsCustom}
      />
      <PromptEditor
        kind="summarize"
        label="Element summary"
        description="Instructions for the automatic Markdown brief written onto each Commons document (Record, Reflect, Upload). Default shape: brief summary, categorized highlights, balcony observations (transcripts only), tensions/polarities, key questions, and theme tags. This is enrichment, not a chat reply — keep Reflect and Ask out of this prompt."
        initialValue={summarizeValue}
        isCustom={summarizeIsCustom}
        rows={16}
      />
      <PromptEditor
        kind="synthesize"
        label="Session synthesis"
        description="Instructions for gathering Finalize synthesis — the session-level Summary document written when a host Finalizes. Uses structured element briefs when available."
        initialValue={synthesizeValue}
        isCustom={synthesizeIsCustom}
        rows={10}
      />
    </div>
  );
}
