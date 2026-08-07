"use client";

import { AskForm } from "@/components/AskForm";
import type { AskScope } from "@/lib/ask/scope";

/**
 * Dashboard's Ask CLara side: same pipeline/action as the full /ask page
 * (askClara), just framed as a dashboard panel. Border tint uses --horizon
 * (DESIGN_GUIDE §2) to read as the "synthesis" surface next to Explore.
 *
 * When the map overlay hands off a question, remount via `formKey` so the
 * scoped thread starts clean and auto-submits.
 */
export function AskClaraPanel({
  formKey = "default",
  scope = null,
  initialQuestion = null,
  autoSubmitInitial = false,
  onClearScope,
}: {
  formKey?: string;
  scope?: AskScope | null;
  initialQuestion?: string | null;
  autoSubmitInitial?: boolean;
  onClearScope?: () => void;
} = {}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 rounded-lg border border-horizon/30 bg-paper p-6 shadow-soft ring-1 ring-horizon/15">
      <h2 className="shrink-0 font-display text-lg font-medium text-ink">
        Ask CLara
      </h2>
      <AskForm
        key={formKey}
        embedded
        scope={scope}
        initialQuestion={initialQuestion}
        autoSubmitInitial={autoSubmitInitial}
        onClearScope={onClearScope}
      />
    </section>
  );
}
