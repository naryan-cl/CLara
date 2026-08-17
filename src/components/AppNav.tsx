"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import {
  isNavGroup,
  isNavGroupActive,
  isNavLinkActive,
  visibleAppNavItems,
  type NavGroup,
  type NavLink,
} from "@/lib/nav/app-nav";

/**
 * App chrome navigation: nested Add / Synthesis groups + mobile hamburger.
 * Why a client component? Open/close and expand state need the browser —
 * the parent layout can stay a Server Component.
 *
 * `key={pathname}` remounts the inner nav on navigation so open menus reset
 * without calling setState inside an effect (React Compiler / eslint rule).
 *
 * Phone sheet always shows group children (Record, Ask, …) so destinations
 * are not hidden behind a second tap. Account + Sign out live in the footer.
 */
export function AppNav({
  isAdmin = false,
  userEmail,
  streamLabel,
}: {
  isAdmin?: boolean;
  userEmail?: string | null;
  streamLabel?: string | null;
}) {
  const pathname = usePathname();
  return (
    <AppNavInner
      key={pathname}
      pathname={pathname}
      isAdmin={isAdmin}
      userEmail={userEmail}
      streamLabel={streamLabel}
    />
  );
}

function AppNavInner({
  pathname,
  isAdmin,
  userEmail,
  streamLabel,
}: {
  pathname: string;
  isAdmin: boolean;
  userEmail?: string | null;
  streamLabel?: string | null;
}) {
  const items = visibleAppNavItems(isAdmin);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState<string | null>(null);
  const menuId = useId();
  const desktopNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      setDesktopOpen(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!desktopOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && desktopNavRef.current?.contains(target)) return;
      setDesktopOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [desktopOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function toggleDesktopGroup(label: string) {
    setDesktopOpen((current) => (current === label ? null : label));
  }

  return (
    <>
      <nav
        ref={desktopNavRef}
        className="relative hidden items-center gap-1 sm:flex"
        aria-label="Main"
      >
        {items.map((item) =>
          isNavGroup(item) ? (
            <DesktopNavGroup
              key={item.label}
              group={item}
              pathname={pathname}
              open={desktopOpen === item.label}
              onToggle={() => toggleDesktopGroup(item.label)}
              onNavigate={() => setDesktopOpen(null)}
            />
          ) : (
            <DesktopNavLink key={item.href} item={item} pathname={pathname} />
          ),
        )}
      </nav>

      <div className="relative z-50 sm:hidden">
        <button
          type="button"
          className="relative z-50 inline-flex h-11 w-11 items-center justify-center rounded-md border border-cloud text-ink transition-colors hover:border-sage/50 hover:text-forest"
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        {mobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-ink/30"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <nav
              id={menuId}
              aria-label="Main"
              aria-modal="true"
              role="dialog"
              className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),18rem)] max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom,0px))] overflow-y-auto rounded-lg border border-cloud bg-paper p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-soft animate-fade-rise motion-reduce:animate-none"
            >
              <ul className="flex flex-col gap-1">
                {items.map((item) =>
                  isNavGroup(item) ? (
                    <li key={item.label}>
                      <p
                        className={`px-3 pb-0.5 pt-2 font-mono text-xs font-medium uppercase tracking-wide ${
                          isNavGroupActive(pathname, item)
                            ? "text-forest"
                            : "text-ink/50"
                        }`}
                      >
                        {item.label}
                      </p>
                      <ul className="mb-1 ml-2 flex flex-col gap-0.5 border-l border-cloud pl-2">
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm transition-colors ${
                                isNavLinkActive(pathname, child.href)
                                  ? "bg-sand font-medium text-forest"
                                  : "text-ink/70 hover:bg-sand hover:text-forest"
                              }`}
                              onClick={() => setMobileOpen(false)}
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex min-h-11 items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                          isNavLinkActive(pathname, item.href)
                            ? "bg-sand text-forest"
                            : "text-ink/80 hover:bg-sand hover:text-forest"
                        }`}
                        onClick={() => setMobileOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
              {userEmail || streamLabel ? (
                <div className="mt-3 border-t border-cloud px-1 pt-3">
                  {streamLabel ? (
                    <p className="truncate font-mono text-xs uppercase tracking-wide text-sage">
                      {streamLabel}
                    </p>
                  ) : null}
                  {userEmail ? (
                    <p className="mt-1 truncate text-sm text-ink/60">
                      {userEmail}
                    </p>
                  ) : null}
                  <SignOutButton className="mt-2 flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium text-ink/70 hover:bg-sand hover:text-danger" />
                </div>
              ) : null}
            </nav>
          </>
        ) : null}
      </div>
    </>
  );
}

function DesktopNavLink({
  item,
  pathname,
}: {
  item: NavLink;
  pathname: string;
}) {
  const active = isNavLinkActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "text-forest nav-active-glow motion-reduce:animate-none"
          : "text-ink/70 hover:text-forest"
      }`}
    >
      {item.label}
    </Link>
  );
}

function DesktopNavGroup({
  group,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const active = isNavGroupActive(pathname, group);
  const panelId = useId();

  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
          active || open
            ? "text-forest nav-active-glow motion-reduce:animate-none"
            : "text-ink/70 hover:text-forest"
        }`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {group.label}
        <ChevronIcon
          className={`opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] rounded-md border border-cloud bg-paper py-1 shadow-soft"
        >
          {group.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={`block px-3 py-2 text-sm transition-colors ${
                isNavLinkActive(pathname, child.href)
                  ? "bg-sand font-medium text-forest"
                  : "text-ink/70 hover:bg-sand hover:text-forest"
              }`}
              onClick={onNavigate}
            >
              {child.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 5h12M3 9h12M3 13h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 4.5l9 9M13.5 4.5l-9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
