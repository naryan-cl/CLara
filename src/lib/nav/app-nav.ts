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
      { href: "/ask", label: "Ask CLara" },
      { href: "/map", label: "Knowledge Map" },
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
