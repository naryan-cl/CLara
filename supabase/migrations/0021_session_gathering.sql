-- Sessions as intentional gatherings (IA v2):
-- short join_code, soft-close finalize fields, user-described document_links.

-- ---------------------------------------------------------------------------
-- sessions: join code + finalize metadata
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists join_code text,
  add column if not exists finalized_at timestamptz,
  add column if not exists synthesis_document_id uuid references public.documents (id) on delete set null;

-- Backfill short uppercase codes for existing rows (collision-safe retry in app).
update public.sessions
set join_code = upper(substr(replace(share_token::text, '-', ''), 1, 6))
where join_code is null;

alter table public.sessions
  alter column join_code set not null;

create unique index if not exists sessions_stream_join_code_uidx
  on public.sessions (stream_id, join_code);

-- ---------------------------------------------------------------------------
-- document_links: user-described Relate edges (never nesting)
-- source document → target document and/or target session
-- ---------------------------------------------------------------------------
create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  source_document_id uuid not null references public.documents (id) on delete cascade,
  target_document_id uuid references public.documents (id) on delete cascade,
  target_session_id uuid references public.sessions (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_links_has_target check (
    target_document_id is not null or target_session_id is not null
  ),
  constraint document_links_not_self_doc check (
    target_document_id is null or target_document_id <> source_document_id
  )
);

create unique index if not exists document_links_source_target_doc_uidx
  on public.document_links (source_document_id, target_document_id)
  where target_document_id is not null;

create unique index if not exists document_links_source_target_session_uidx
  on public.document_links (source_document_id, target_session_id)
  where target_session_id is not null;

create index if not exists document_links_stream_id_idx
  on public.document_links (stream_id);

alter table public.document_links enable row level security;

create policy "Members can read document_links in their streams"
  on public.document_links for select
  using (
    exists (
      select 1 from public.stream_members sm
      where sm.stream_id = document_links.stream_id
        and sm.user_id = auth.uid()
    )
  );

create policy "Authors can insert document_links for own documents"
  on public.document_links for insert
  with check (
    exists (
      select 1 from public.documents d
      where d.id = source_document_id
        and d.created_by = auth.uid()
        and d.stream_id = document_links.stream_id
    )
  );

create policy "Authors can delete document_links for own documents"
  on public.document_links for delete
  using (
    exists (
      select 1 from public.documents d
      where d.id = source_document_id
        and d.created_by = auth.uid()
    )
  );
