import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { SignOutButton } from "@/components/SignOutButton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { stream, error } = await getActiveStream();
  const streamLabel = stream?.name ?? "No stream";

  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="relative z-50 h-[var(--clara-header-height)] border-b border-cloud bg-paper pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              className="font-display text-lg font-medium text-ink"
            >
              CLara
            </Link>
            <span
              className="hidden truncate rounded-pill border border-sage/40 px-3 py-1 font-mono text-xs uppercase tracking-wide text-sage shadow-[0_0_12px_rgba(143,214,196,0.2)] sm:inline"
              title={
                stream
                  ? `stream_id: ${stream.id} · role: ${stream.role}`
                  : (error ?? "Not a member of any stream yet")
              }
            >
              {streamLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <AppNav
              isAdmin={stream?.role === "admin"}
              userEmail={user.email}
              streamLabel={streamLabel}
            />
            <span className="hidden text-sm text-ink/60 sm:inline">
              {user.email}
            </span>
            <span className="hidden sm:inline">
              <SignOutButton />
            </span>
          </div>
        </div>
      </header>

      {!stream ? (
        <div className="border-b border-warning/30 bg-paper px-6 py-3 text-sm text-ink/80">
          You&apos;re signed in, but not a member of any stream yet. Ask a
          stream admin to add your account to <strong>Camp CLAI</strong>{" "}
          <span className="font-mono text-xs">(stream_members)</span>
          {error ? (
            <span className="mt-1 block font-mono text-xs text-danger">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
