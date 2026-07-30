import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveStream } from "@/lib/streams/get-active-stream";
import { SignOutButton } from "@/components/SignOutButton";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sessions", label: "Sessions" },
  { href: "/map", label: "Map" },
  { href: "/chat", label: "Chat" },
  { href: "/ask", label: "Ask CLara" },
  { href: "/admin", label: "Admin" },
];

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
      <header className="border-b border-cloud bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="font-display text-lg font-medium text-ink"
            >
              CLara
            </Link>
            <span
              className="rounded-pill border border-sage/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-sage"
              title={
                stream
                  ? `stream_id: ${stream.id} · role: ${stream.role}`
                  : (error ?? "Not a member of any stream yet")
              }
            >
              {streamLabel}
            </span>
          </div>

          <nav className="hidden gap-6 sm:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-ink/70 transition-colors hover:text-forest"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
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
          (<span className="font-mono text-xs">(stream_members)</span>
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
