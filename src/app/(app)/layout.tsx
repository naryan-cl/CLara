import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { SignOutButton } from "@/components/SignOutButton";
import { LeaveLinkGuestButton } from "@/components/LeaveLinkGuestButton";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext } from "@/lib/access/get-access-context";
import {
  isGuestAllowedPath,
  isLinkGuestAllowedPath,
  isPendingAllowedPath,
} from "@/lib/access/paths";
import { loginHref, safeNextPath } from "@/lib/access/safe-next-path";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const headerStore = await headers();
  const rawPath = headerStore.get("x-clara-pathname") || "/dashboard";
  const nextPath = safeNextPath(rawPath) ?? "/dashboard";
  const pathOnly = nextPath.split("?")[0] ?? "/dashboard";

  const access = await getAccessContext();

  if (!user) {
    if (access.kind === "link_guest") {
      if (!isLinkGuestAllowedPath(pathOnly)) {
        redirect("/dashboard");
      }
    } else {
      redirect(loginHref(nextPath));
    }
  } else if (access.kind === "pending" || access.kind === "none") {
    if (!isPendingAllowedPath(pathOnly)) {
      redirect("/waiting");
    }
  } else if (access.kind === "guest") {
    if (!isGuestAllowedPath(pathOnly)) {
      redirect("/dashboard");
    }
  }

  const stream = access.stream;
  const streamLabel =
    access.kind === "guest" || access.kind === "link_guest"
      ? `Guest · ${access.guestSessions[0]?.name ?? "Session"}`
      : (stream?.name ?? "No stream");

  const identityLabel =
    access.kind === "link_guest"
      ? access.displayName
      : (user?.email ?? null);

  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="relative z-50 h-[var(--clara-header-height)] border-b border-cloud bg-paper pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href={
                access.kind === "member" ||
                access.kind === "guest" ||
                access.kind === "link_guest"
                  ? "/dashboard"
                  : "/waiting"
              }
              className="font-display text-lg font-medium text-ink"
            >
              CLara
            </Link>
            <span
              className="hidden truncate rounded-pill border border-sage/40 px-3 py-1 font-mono text-xs uppercase tracking-wide text-sage shadow-[0_0_12px_rgba(143,214,196,0.2)] sm:inline"
              title={
                stream
                  ? `stream_id: ${stream.id} · role: ${stream.role}`
                  : access.kind === "guest" || access.kind === "link_guest"
                    ? "Session-scoped guest"
                    : "Not a member of any stream yet"
              }
            >
              {streamLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <AppNav
              isAdmin={stream?.role === "admin"}
              accessKind={access.kind}
              userEmail={identityLabel}
              streamLabel={streamLabel}
            />
            <span className="hidden text-sm text-ink/60 sm:inline">
              {identityLabel}
            </span>
            <span className="hidden sm:inline">
              {access.kind === "link_guest" ? (
                <LeaveLinkGuestButton />
              ) : (
                <SignOutButton />
              )}
            </span>
          </div>
        </div>
      </header>

      {access.kind === "pending" || (access.kind === "none" && user) ? (
        <div className="border-b border-warning/30 bg-paper px-6 py-3 text-sm text-ink/80">
          You&apos;re signed in, but waiting for access.{" "}
          <Link href="/waiting" className="font-medium text-forest underline">
            Check status
          </Link>
        </div>
      ) : null}

      {access.kind === "guest" || access.kind === "link_guest" ? (
        <div className="border-b border-horizon/25 bg-paper px-6 py-3 text-sm text-ink/80">
          Session guest — you can contribute to this gathering only, not the
          full Commons.
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
