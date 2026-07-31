"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { addStreamMemberByEmail } from "@/lib/streams/add-member";
import { removeStreamMember } from "@/lib/streams/remove-member";
import { updateMemberRole } from "@/lib/streams/update-member-role";
import { updateStreamIsolation } from "@/lib/streams/update-isolation";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; streamId: string; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const { stream } = await getActiveStream();
  if (!stream || stream.role !== "admin") {
    return { ok: false, error: "Not authorized." };
  }

  return { ok: true, streamId: stream.id, userId: user.id };
}

export async function addMember(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { ok: false, error: "Enter an email address." };
  }

  const { error } = await addStreamMemberByEmail(auth.streamId, email);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (userId === auth.userId) {
    return { ok: false, error: "You can't remove yourself." };
  }

  const { error } = await removeStreamMember(auth.streamId, userId);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function changeMemberRole(
  userId: string,
  role: "admin" | "member",
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (userId === auth.userId) {
    return { ok: false, error: "You can't change your own role." };
  }

  const { error } = await updateMemberRole(auth.streamId, userId, role);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleIsolation(enabled: boolean): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { error } = await updateStreamIsolation(auth.streamId, enabled);
  if (error) {
    return { ok: false, error };
  }

  revalidatePath("/admin");
  return { ok: true };
}
