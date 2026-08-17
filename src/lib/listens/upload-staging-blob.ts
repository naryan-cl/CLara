import { createClient } from "@/lib/supabase/client";
import { MAX_LISTENS_STAGING_BYTES } from "@/lib/openai/transcribe";
import type { ListensStagingExtension } from "@/lib/listens/audio-format";

/**
 * Browser → private `listens-staging` object.
 * Why: Vercel Server Actions cap the body around 4.5MB, so long audio must
 * never travel through a form POST. Record already uses this path.
 */
export async function uploadListensStagingBlob(input: {
  streamId: string;
  recordingId: string;
  index: number;
  blob: Blob;
  mimeType: string;
  fileExtension: ListensStagingExtension;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.blob.size === 0) {
    return { ok: false, error: "Empty audio segment. Try a different file." };
  }
  if (input.blob.size > MAX_LISTENS_STAGING_BYTES) {
    return {
      ok: false,
      error: `This piece is too large for Whisper (${Math.round(input.blob.size / 1024 / 1024)}MB). Try a compressed M4A/MP3.`,
    };
  }

  const supabase = createClient();
  const path = `${input.streamId}/${input.recordingId}/${input.index}.${input.fileExtension}`;
  const { error } = await supabase.storage.from("listens-staging").upload(
    path,
    input.blob,
    {
      contentType: input.mimeType || input.blob.type || "application/octet-stream",
      upsert: false,
    },
  );

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("not found") || error.message.includes("Bucket")
          ? "Listens storage isn’t set up yet. Ask an admin to run migration 0014."
          : `Audio upload failed: ${error.message}`,
    };
  }

  return { ok: true };
}
