import { AskForm } from "@/components/AskForm";

/**
 * Dashboard's Ask CLara side: same pipeline/action as the full /ask page
 * (askClara), just framed as a dashboard panel. Border tint uses --horizon
 * (DESIGN_GUIDE §2) to read as the "synthesis" surface next to Explore.
 */
export function AskClaraPanel() {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-horizon/30 bg-paper p-6 shadow-soft">
      <h2 className="font-display text-lg font-medium text-ink">
        Ask CLara
      </h2>
      <AskForm />
    </section>
  );
}
