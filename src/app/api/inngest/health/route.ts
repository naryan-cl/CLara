import { NextResponse } from "next/server";
import { getInngestEnvStatus } from "@/lib/inngest/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public probe — booleans only, no secret values. */
export async function GET() {
  const status = getInngestEnvStatus();
  const ready = status.hasSigningKey;

  return NextResponse.json(
    {
      ready,
      ...status,
      hint: ready
        ? "Signing key is present. Sync Inngest to /api/inngest."
        : "INNGEST_SIGNING_KEY missing at runtime. Re-save in Vercel (Production) and redeploy.",
    },
    { status: ready ? 200 : 503 },
  );
}
