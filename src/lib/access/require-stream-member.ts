import { redirect } from "next/navigation";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { getAccessContext } from "@/lib/access/get-access-context";
import type { StreamSummary } from "@/lib/streams/types";

export async function requireStreamMember(): Promise<StreamSummary> {
  const { stream } = await getActiveStream();
  if (stream) return stream;

  const access = await getAccessContext();
  if (access.kind === "guest") {
    redirect("/dashboard");
  }
  if (access.kind === "link_guest") {
    redirect("/dashboard");
  }
  redirect("/waiting");
}
