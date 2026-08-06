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
      <header className="relative z-50 border-b border-cloud bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/dashboard"
              className="font-display text-lg font-medium text-ink"
            >
              CLara
            </Link>
            <span
              className="truncate rounded-pill border border-sage/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-sage shadow-[0_0_12px_rgba(143,214,196,0.2)]"
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
            <AppNav />
            <span className="hidden text-sm text-ink/60 sm:inline">
              {user.email}
            </span>
            <SignOutButton />
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
