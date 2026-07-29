import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="border-b border-cloud bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="font-display text-lg font-medium text-ink">
              CLara
            </Link>
            <span className="rounded-pill border border-sage/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-sage">
              Camp CLAI
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
