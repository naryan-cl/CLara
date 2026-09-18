import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestSessionGuestAccess } from "@/lib/access/request-guest-access";
import { lookupJoinSessionPublic } from "@/lib/access/link-guest";
import { markAttended } from "@/lib/sessions/attendance";
import { type JoinMode } from "@/lib/sessions/types";
import { JoinChooser } from "@/app/(public)/join/[token]/join-chooser";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string; error?: string }>;
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
 * Share/QR entry: members and signed-in guests join immediately;
 * unsigned visitors pick login or a guest display name.
 */
export default async function JoinSessionPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { mode: modeParam, error: errorParam } = await searchParams;
  const mode = resolveMode(modeParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const session = await lookupJoinSessionPublic(token);
    if (!session) {
      return (
        <div className="mx-auto max-w-lg py-16 text-center">
          <h1 className="font-display text-2xl font-medium text-ink">
            Session not found
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            This join link may be invalid or expired.
          </p>
        </div>
      );
    }

    return (
      <JoinChooser
        token={token}
        mode={mode}
        sessionName={session.name}
        seedQuestion={session.seedQuestion}
        reflectWelcome={session.reflectWelcome}
        error={errorParam?.trim() || null}
      />
    );
  }

  const access = await requestSessionGuestAccess(token, mode);

  if (access.error && access.outcome === "not_found" && access.error.includes("0038")) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-medium text-ink">
          Join link unavailable
        </h1>
        <p className="mt-2 text-sm text-ink/60">{access.error}</p>
      </div>
    );
  }

  if (access.outcome === "not_found" || !access.sessionId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-medium text-ink">
          Session not found
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          This join link may be invalid, expired, or you may not have access
          yet.
        </p>
      </div>
    );
  }

  // Legacy pending/rejected rows (pre-auto-approve) still land on waiting.
  if (access.outcome === "pending" || access.outcome === "rejected") {
    redirect(
      `/waiting?session=${encodeURIComponent(access.sessionId)}&status=${access.outcome}`,
    );
  }

  await markAttended(access.sessionId, user.id);
  redirect(addHref(mode, access.sessionId));
}
