-- Soft-delete (Trash) for Commons documents and sessions.
-- Delete in the app sets deleted_at instead of removing the row.
-- Members never see trashed rows; stream admins restore from /admin.
-- Apply in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

alter table public.sessions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

comment on column public.documents.deleted_at is
  'When set, the document is in Admin Trash (hidden from Commons / Ask / map).';
comment on column public.sessions.deleted_at is
  'When set, the session is in Admin Trash (hidden from Commons / join / archive).';

create index if not exists documents_stream_trash_idx
  on public.documents (stream_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists sessions_stream_trash_idx
  on public.sessions (stream_id, deleted_at desc)
  where deleted_at is not null;

-- Live rows keep unique names / join codes. A trashed session does not block
-- creating a new gathering with the same title or code.
alter table public.sessions drop constraint if exists sessions_stream_id_name_key;
drop index if exists sessions_stream_id_name_key;
drop index if exists sessions_stream_name_live_uidx;
create unique index sessions_stream_name_live_uidx
  on public.sessions (stream_id, name)
  where deleted_at is null;

drop index if exists sessions_stream_join_code_uidx;
drop index if exists sessions_stream_join_code_live_uidx;
create unique index sessions_stream_join_code_live_uidx
  on public.sessions (stream_id, join_code)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Hide trash from every SELECT policy (including stream admins).
-- Admin Trash uses the service-role client, which bypasses RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "Members can read public stream documents"
  on public.documents;
create policy "Members can read public stream documents"
  on public.documents for select
  using (
    deleted_at is null
    and privacy_status = 'public'
    and stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

drop policy if exists "Authors can read own documents"
  on public.documents;
create policy "Authors can read own documents"
  on public.documents for select
  using (deleted_at is null and created_by = auth.uid());

drop policy if exists "Session attendees can read linked private documents"
  on public.documents;
create policy "Session attendees can read linked private documents"
  on public.documents for select
  using (
    deleted_at is null
    and privacy_status = 'private'
    and stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
    and (
      (
        session_id is not null
        and exists (
          select 1
          from public.session_attendees sa
          where sa.session_id = documents.session_id
            and sa.user_id = auth.uid()
        )
      )
      or exists (
        select 1
        from public.document_sessions ds
        join public.session_attendees sa on sa.session_id = ds.session_id
        where ds.document_id = documents.id
          and sa.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Stream admins can read stream documents"
  on public.documents;
create policy "Stream admins can read stream documents"
  on public.documents for select
  using (
    deleted_at is null
    and stream_id in (
      select sm.stream_id
      from public.stream_members sm
      where sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
  );

drop policy if exists "Members can read stream sessions"
  on public.sessions;
create policy "Members can read stream sessions"
  on public.sessions for select
  using (
    deleted_at is null
    and stream_id in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Nested-author session edit should ignore documents already in Trash.
create or replace function public.is_nested_session_document_author(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    where d.session_id = p_session_id
      and d.created_by = auth.uid()
      and d.deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Ask retrieval: never return chunks from trashed documents (or sessions).
-- ---------------------------------------------------------------------------
create or replace function public.match_document_chunks(
  p_stream_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 6,
  p_document_id uuid default null,
  p_session_id uuid default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_type text,
  session_id uuid,
  session_name text,
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized: you are not a member of this stream.';
  end if;

  return query
    select
      de.id as chunk_id,
      de.document_id,
      d.title as document_title,
      d.type as document_type,
      d.session_id,
      s.name as session_name,
      de.content,
      1 - (de.embedding <=> p_query_embedding) as similarity
    from public.document_embeddings de
    join public.documents d on d.id = de.document_id
    left join public.sessions s on s.id = d.session_id and s.deleted_at is null
    where de.stream_id = p_stream_id
      and d.deleted_at is null
      and (d.privacy_status = 'public' or d.created_by = auth.uid())
      and (p_document_id is null or de.document_id = p_document_id)
      and (p_session_id is null or d.session_id = p_session_id)
    order by de.embedding <=> p_query_embedding
    limit p_match_count;
end;
$$;

grant execute on function public.match_document_chunks(uuid, vector, int, uuid, uuid) to authenticated;

-- Admin Ask-index: skip trashed documents.
create or replace function public.list_documents_missing_embeddings(
  p_stream_id uuid
)
returns table (
  document_id uuid,
  title text,
  document_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id
      and sm.user_id = auth.uid()
      and sm.role = 'admin'
  ) then
    raise exception 'Not authorized: stream admins only.';
  end if;

  return query
    select
      d.id as document_id,
      d.title,
      d.type as document_type
    from public.documents d
    where d.stream_id = p_stream_id
      and d.deleted_at is null
      and coalesce(d.is_draft, false) = false
      and d.content is not null
      and length(trim(d.content)) > 0
      and not exists (
        select 1
        from public.document_embeddings de
        where de.document_id = d.id
      )
    order by d.created_at desc;
end;
$$;

grant execute on function public.list_documents_missing_embeddings(uuid) to authenticated;
