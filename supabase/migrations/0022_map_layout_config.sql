-- Stream-scoped Dashboard / Knowledge Map layout knobs (admin playground).
-- NULL = product defaults in src/lib/graph/map-layout-config.ts.
-- Admins already UPDATE streams under 0007_admin_membership RLS.

alter table public.streams
  add column if not exists map_layout_config jsonb;

comment on column public.streams.map_layout_config is
  'Optional force-layout + size overrides for Dashboard/Knowledge Map. NULL = code defaults.';
