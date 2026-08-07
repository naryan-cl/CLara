import { NextResponse } from "next/server";
import { getInngestEnvStatus } from "@/lib/inngest/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public probe — booleans only, no secret values. */
export async function GET() {
  const inngest = getInngestEnvStatus();
  const hasSupabaseUrl = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );
  const hasSupabaseSecret = Boolean(
    process.env.SUPABASE_SECRET_KEY?.trim(),
  );
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  const ready =
    inngest.hasSigningKey && hasSupabaseUrl && hasSupabaseSecret && hasOpenAiKey;

  const missing: string[] = [];
  if (!inngest.hasSigningKey) missing.push("INNGEST_SIGNING_KEY");
  if (!inngest.hasEventKey) missing.push("INNGEST_EVENT_KEY");
  if (!hasSupabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!hasSupabaseSecret) missing.push("SUPABASE_SECRET_KEY");
  if (!hasOpenAiKey) missing.push("OPENAI_API_KEY");

  return NextResponse.json(
    {
      ready,
      inngest,
      hasSupabaseUrl,
      hasSupabaseSecret,
      hasOpenAiKey,
      missing,
      hint:
        missing.length === 0
          ? "Runtime env looks complete. If Inngest runs still fail, open a failed run and check the step error (often Storage download path or Whisper)."
          : `Missing at runtime on this deployment: ${missing.join(", ")}. Set in Vercel → Settings → Environment Variables (Production) and redeploy.`,
    },
    { status: ready ? 200 : 503 },
  );
}
