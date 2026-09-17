/**
 * Primary app navigation — Add → Commons → Synthesis IA (prd §7, Phase 6).
 * Kept as plain data so the UI component stays thin and routes are easy to update.
 */

export type NavLink = {
  href: string;
  label: string;
};

export type NavGroup = {
  label: string;
  children: NavLink[];
};

export type NavItem = NavLink | NavGroup;

export function isNavGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

/** Strip hash/query so we can match the current pathname. */
export function hrefPath(href: string): string {
  const path = href.split("#")[0]?.split("?")[0];
  return path && path.length > 0 ? path : "/";
}

export function isNavLinkActive(pathname: string, href: string): boolean {
  const path = hrefPath(href);
  if (path === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isNavGroupActive(pathname: string, group: NavGroup): boolean {
  return group.children.some((child) => isNavLinkActive(pathname, child.href));
}

export const APP_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  {
    label: "Add",
    children: [
      { href: "/add/session", label: "Session" },
      { href: "/add/chat", label: "Reflect" },
      { href: "/add/record", label: "Record" },
      { href: "/add/upload", label: "Upload" },
    ],
  },
  { href: "/commons", label: "Commons" },
  {
    label: "Synthesis",
    children: [
      { href: "/synthesis/preliminary", label: "Naryan and Gayle's Synthesis" },
      { href: "/ask", label: "Ask CLara" },
      { href: "/map", label: "Knowledge Map" },
      { href: "/top10", label: "Top 10" },
      { href: "/common-ground", label: "Common Ground" },
    ],
  },
  { href: "/guide", label: "Guide" },
  { href: "/admin", label: "Admin" },
];

function isAdminNavItem(item: NavItem): boolean {
  return !isNavGroup(item) && item.href === "/admin";
}

/** Full nav for stream admins; everyone else omits Admin. */
export function visibleAppNavItems(isAdmin: boolean): NavItem[] {
  if (isAdmin) return APP_NAV_ITEMS;
  return APP_NAV_ITEMS.filter((item) => !isAdminNavItem(item));
}

/** Session guests: Dashboard + Add (no Session create) + Guide. */
export const GUEST_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  {
    label: "Add",
    children: [
      { href: "/add/chat", label: "Reflect" },
      { href: "/add/record", label: "Record" },
      { href: "/add/upload", label: "Upload" },
    ],
  },
  { href: "/guide", label: "Guide" },
];

/** Pending / no access: Guide + Waiting only. */
export const PENDING_NAV_ITEMS: NavItem[] = [
  { href: "/waiting", label: "Access" },
  { href: "/guide", label: "Guide" },
];

export function navItemsForAccess(
  kind: "member" | "guest" | "link_guest" | "pending" | "none",
  isAdmin: boolean,
): NavItem[] {
  if (kind === "guest" || kind === "link_guest") return GUEST_NAV_ITEMS;
  if (kind === "pending" || kind === "none") return PENDING_NAV_ITEMS;
  return visibleAppNavItems(isAdmin);
}
