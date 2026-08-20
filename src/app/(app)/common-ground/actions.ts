"use server";

import { inngest, CLARA_COMMON_GROUND_REQUESTED } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export async function requestCommonGroundReport(sessionIds: string[]): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string }
> {
  const uniqueIds = [...new Set(sessionIds.filter(Boolean))];
  if (uniqueIds.length < 2) {
    return {
      ok: false,
      error: "Select at least two finalized sessions to synthesize.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream) {
    return { ok: false, error: "No active stream." };
  }

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, name, finalized_at")
    .eq("stream_id", stream.id)
    .in("id", uniqueIds);

  if (error) {
    return { ok: false, error: error.message };
  }

  const finalized = (sessions ?? []).filter((s) => s.finalized_at);
  if (finalized.length < 2) {
    return {
      ok: false,
      error: "Choose at least two sessions that have been Finalized.",
    };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const title = `Common Ground · ${stamp}`;

  try {
    await inngest.send({
      name: CLARA_COMMON_GROUND_REQUESTED,
      data: {
        streamId: stream.id,
        sessionIds: finalized.map((s) => s.id as string),
        createdBy: user.id,
        title,
      },
    });
  } catch (err) {
    console.error("requestCommonGroundReport:", err);
    return { ok: false, error: "Could not start synthesis. Try again shortly." };
  }

  return {
    ok: true,
    message:
      "Common Ground report is generating. Look for a new Summary in Commons in about a minute.",
  };
}
