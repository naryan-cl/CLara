-- Phase 5 module 1: sessions as first-class event containers.
-- prd-v0.5.md §7.2 ("Full session archive") · dev-plan-v0.3.md §5 Phase 5
--
-- documents.session_id was a free-text field (no rows had it set in
-- production at the time of this migration — safe to drop and recreate
-- as a real foreign key instead of adding a parallel column).

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  name text not null,
  occurred_at date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stream_id, name)
);

create index sessions_stream_id_idx on public.sessions (stream_id);

create or replace function public.set_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row
  execute function public.set_sessions_updated_at();

alter table public.sessions enable row level security;

-- Members can see sessions in the streams they belong to.
create policy "Members can read stream sessions"
  on public.sessions for select
  using (
    stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Members can create sessions in their streams (e.g. tagging a document to
-- a new session from the document editor).
create policy "Members can insert stream sessions"
  on public.sessions for insert
  with check (
    stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
    and (created_by is null or created_by = auth.uid())
  );

-- Renaming/correcting a session is an admin (metadata queue) job, same as
-- the needs_review queue on documents.
create policy "Stream admins can update stream sessions"
  on public.sessions for update
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

-- documents.session_id: free-text -> real FK into sessions.
alter table public.documents drop column session_id;
alter table public.documents
  add column session_id uuid references public.sessions (id) on delete set null;

create index documents_session_id_idx on public.documents (session_id);
