-- Knowledge Map (Phase 4): stream-scoped nodes + edges
-- prd-v0.5.md §6 · dev-plan-v0.3.md "Next up"
--
-- Extraction only ever runs on Public documents (see clara-extract-graph),
-- so nodes/edges carry no private content — any stream member can read the
-- whole graph. All writes come from the admin (service-role) client inside
-- the Inngest job, never from a request-scoped client, so there are no
-- insert/update/delete policies here — same posture as document_embeddings
-- (0008).

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  type text not null,
  label text not null,
  description text,
  source_document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive dedupe: repeated extraction across documents should
-- reuse the same node instead of piling up near-duplicates.
create unique index nodes_stream_label_idx
  on public.nodes (stream_id, lower(label));

create index nodes_stream_id_idx on public.nodes (stream_id);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  source_node_id uuid not null references public.nodes (id) on delete cascade,
  target_node_id uuid not null references public.nodes (id) on delete cascade,
  relationship text,
  source_document_id uuid references public.documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Directed edge dedupe: re-extraction upserts the relationship label
-- rather than creating a second edge between the same two nodes.
create unique index edges_stream_source_target_idx
  on public.edges (stream_id, source_node_id, target_node_id);

create index edges_stream_id_idx on public.edges (stream_id);

create or replace function public.set_knowledge_map_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nodes_set_updated_at
  before update on public.nodes
  for each row
  execute function public.set_knowledge_map_updated_at();

create trigger edges_set_updated_at
  before update on public.edges
  for each row
  execute function public.set_knowledge_map_updated_at();

alter table public.nodes enable row level security;
alter table public.edges enable row level security;

create policy "Members can read stream nodes"
  on public.nodes for select
  using (
    stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

create policy "Members can read stream edges"
  on public.edges for select
  using (
    stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );
