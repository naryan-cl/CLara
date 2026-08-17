import { createAdminClient } from "@/lib/supabase/admin";
import {
  listensStagingPaths,
  parseListensJobMeta,
  type ListensJobMeta,
} from "@/lib/listens/job-meta";

export async function removeListensStaging(
  streamId: string,
  meta: ListensJobMeta,
): Promise<void> {
  const paths = listensStagingPaths(streamId, meta);
  if (paths.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("listens-staging").remove(paths);
  if (error) {
    console.error("removeListensStaging:", error);
  }
}

export async function removeListensStagingFromContent(
  streamId: string,
  content: string | null | undefined,
): Promise<void> {
  const meta = content ? parseListensJobMeta(content) : null;
  if (!meta) return;
  await removeListensStaging(streamId, meta);
}
