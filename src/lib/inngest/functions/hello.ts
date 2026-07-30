import { inngest, CLARA_HELLO } from "@/lib/inngest/client";

/**
 * Tiny smoke-test job so we can confirm Inngest ↔ Vercel sync.
 * Replace with real Commons jobs (Receives / Listens / graph) in later phases.
 */
export const helloWorldFn = inngest.createFunction(
  {
    id: "clara-hello",
    retries: 1,
    triggers: [{ event: CLARA_HELLO }],
  },
  async ({ event, step }) => {
    const message = await step.run("compose-hello", async () => {
      const who =
        typeof event.data?.who === "string" ? event.data.who : "CLara";
      return `Hello from ${who} Inngest at ${new Date().toISOString()}`;
    });

    return { ok: true, message };
  },
);

export const inngestFunctions = [helloWorldFn];
