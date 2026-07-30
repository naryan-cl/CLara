-- Commons documents: stream-scoped Markdown + OKF metadata
-- prd-v0.4.md §5.2 · dev-plan-v0.2.md §1.2

create type public.document_privacy as enum ('public', 'private');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  content text not null default '',
  title text,
  session_id text,
  type text,
  participants jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  privacy_status public.document_privacy not null default 'public',
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_stream_id_idx on public.documents (stream_id);
create index documents_stream_created_at_idx on public.documents (stream_id, created_at desc);
create index documents_needs_review_idx on public.documents (stream_id) where needs_review = true;

create or replace function public.set_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_set_updated_at
  before update on public.documents
  for each row
  execute function public.set_documents_updated_at();

alter table public.documents enable row level security;

-- Members can read public Commons docs in their streams.
create policy "Members can read public stream documents"
  on public.documents for select
  using (
    privacy_status = 'public'
    and stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Authors can always read their own docs (including private).
create policy "Authors can read own documents"
  on public.documents for select
  using (created_by = auth.uid());

-- Members can insert into streams they belong to.
create policy "Members can insert documents in their streams"
  on public.documents for insert
  with check (
    stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
    and (created_by is null or created_by = auth.uid())
  );

-- Authors can update their own documents.
create policy "Authors can update own documents"
  on public.documents for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Stream admins can update any doc in their stream (OKF / needs_review queue).
create policy "Stream admins can update stream documents"
  on public.documents for update
  using (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );
