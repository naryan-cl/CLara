import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { getInngestServeOrigin } from "@/lib/inngest/env";
import { inngestFunctions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const serveOrigin = getInngestServeOrigin();

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
  ...(serveOrigin ? { serveOrigin } : {}),
});
