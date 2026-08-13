import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionByShareToken } from "@/lib/sessions/get-session-by-share-token";
import { getSessionByJoinCode } from "@/lib/sessions/get-session-by-join-code";
import { markAttended } from "@/lib/sessions/attendance";
import {
  looksLikeShareToken,
  type JoinMode,
} from "@/lib/sessions/types";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string }>;
};

function resolveMode(raw: string | undefined): JoinMode {
  if (raw === "record" || raw === "upload" || raw === "reflect") return raw;
  return "reflect";
}

function addHref(mode: JoinMode, sessionId: string): string {
  if (mode === "record") return `/add/record?session=${sessionId}`;
  if (mode === "upload") return `/add/upload?session=${sessionId}`;
  return `/add/chat?session=${sessionId}`;
}

/**
 * Share/QR entry: resolve by short join code (preferred) or legacy share_token,
 * mark attendance, open Reflect / Record / Upload with the session pre-linked.
 */
export default async function JoinSessionPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { mode: modeParam } = await searchParams;
  const mode = resolveMode(modeParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolved = looksLikeShareToken(token)
    ? await getSessionByShareToken(token)
    : await getSessionByJoinCode(token);

  const { session, error } = resolved;

  if (error || !session) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-medium text-ink">
          Session not found
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          This join link may be invalid, or you may not be a member of its
          stream.
        </p>
        <a
          href="/add/session"
          className="mt-6 inline-block text-sm text-horizon underline"
        >
          Create a session
        </a>
      </div>
    );
  }

  await markAttended(session.id, user.id);

  redirect(addHref(mode, session.id));
}
