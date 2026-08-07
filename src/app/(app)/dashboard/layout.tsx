/**
 * Dashboard is a full-bleed map under the nav. Collapse the shared main
 * padding/max-width so floating chrome can sit edge-to-edge; the map itself
 * uses fixed positioning below --clara-header-height.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative -mx-6 -my-10 min-h-[calc(100vh-var(--clara-header-height))] w-[calc(100%+3rem)] flex-1">
      {children}
    </div>
  );
}
