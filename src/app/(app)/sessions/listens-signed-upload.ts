"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveContributionContext } from "@/lib/access/resolve-contribution";
import { listensStagingExtension } from "@/lib/listens/audio-format";

/**
 * Signed upload URL for named join-link guests (no Supabase auth session,
 * so storage RLS for stream members cannot apply).
 */
export async function createListensStagingSignedUpload(input: {
  streamId: string;
  recordingId: string;
  index: number;
  mimeType?: string;
  fileExtension?: string;
  sessionIds?: string[];
}): Promise<
  | { ok: true; signedUrl: string; token: string; path: string }
  | { ok: false; error: string }
> {
  const contribution = await resolveContributionContext(input.sessionIds);
  if (!contribution.ok) {
    return { ok: false, error: contribution.error };
  }
  if (contribution.kind !== "link_guest") {
    return {
      ok: false,
      error: "Signed upload is only for guest join-link contributors.",
    };
  }
  if (contribution.stream.id !== input.streamId) {
    return { ok: false, error: "Stream mismatch for this guest session." };
  }

  const recordingId = input.recordingId.trim();
  if (!recordingId || recordingId.includes("/")) {
    return { ok: false, error: "Invalid recording id." };
  }
  if (!Number.isInteger(input.index) || input.index < 0) {
    return { ok: false, error: "Invalid segment index." };
  }

  const ext = listensStagingExtension({
    fileExtension: input.fileExtension,
    mimeType: input.mimeType,
  });
  const path = `${input.streamId}/${recordingId}/${input.index}.${ext}`;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("listens-staging")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return {
        ok: false,
        error: error?.message ?? "Could not create upload URL.",
      };
    }

    return {
      ok: true,
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path || path,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not create guest upload URL.",
    };
  }
}
