import { createClient } from "@/lib/supabase/server";

export type InviteOrAddResult =
  | { ok: true; status: "added" | "invited"; message: string }
  | { ok: false; error: string };

/**
 * Add an existing account as a stream member, or allowlist the email so they
 * join as a member on first signup. Does not send email.
 */
export async function inviteOrAddStreamMember(
  streamId: string,
  email: string,
): Promise<InviteOrAddResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("invite_or_add_stream_member", {
    p_stream_id: streamId,
    p_email: email.trim(),
  });

  if (error) {
    if (
      error.message?.includes("invite_or_add_stream_member") ||
      error.message?.includes("schema cache")
    ) {
      return {
        ok: false,
        error:
          "Membership invite needs migration 0038_session_guest_access.sql.",
      };
    }
    return { ok: false, error: error.message };
  }

  const status = data === "invited" ? "invited" : "added";
  return {
    ok: true,
    status,
    message:
      status === "invited"
        ? "Invited — they will join as a full member on first sign-in."
        : "Added to the stream.",
  };
}

/** @deprecated Prefer inviteOrAddStreamMember — kept for older call sites. */
export async function addStreamMemberByEmail(
  streamId: string,
  email: string,
): Promise<{ error: string | null }> {
  const result = await inviteOrAddStreamMember(streamId, email);
  return { error: result.ok ? null : result.error };
}
