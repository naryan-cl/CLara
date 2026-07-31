"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { markAttended, unmarkAttended } from "@/lib/sessions/attendance";

export type ToggleAttendanceResult =
  | { ok: true; attending: boolean }
  | { ok: false; error: string };

export async function toggleAttendance(
  sessionId: string,
  attending: boolean,
): Promise<ToggleAttendanceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { error } = attending
      ? await markAttended(sessionId, user.id)
      : await unmarkAttended(sessionId, user.id);

    if (error) {
      return { ok: false, error };
    }

    revalidatePath(`/sessions/archive/${sessionId}`);
    revalidatePath("/sessions/harvest");

    return { ok: true, attending };
  } catch (err) {
    console.error("toggleAttendance failed:", err);
    return { ok: false, error: "Something went wrong." };
  }
}
