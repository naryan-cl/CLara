-- Session Composer: seed/description/share, multi-session document links,
-- related sessions, private-doc visibility for attendees/admins, member-safe
-- peer list for participant autocomplete.
-- Reflect + shared Session Composer (prd / dev-plan Progress).

-- ---------------------------------------------------------------------------
-- sessions: seed, description, share token; creators may update their rows
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists seed_question text,
  add column if not exists description text,
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists sessions_share_token_uidx
  on public.sessions (share_token);

-- Backfill any rows that somehow lack a token (column default covers new rows).
update public.sessions
set share_token = gen_random_uuid()
where share_token is null;

create policy "Session creators can update their sessions"
  on public.sessions for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- document_sessions: reflection/artifact ↔ up to N sessions
-- ---------------------------------------------------------------------------
create table public.document_sessions (
  document_id uuid not null references public.documents (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, session_id)
);

create index document_sessions_session_id_idx
  on public.document_sessions (session_id);

alter table public.document_sessions enable row level security;

create policy "Members can read document_sessions in their streams"
  on public.document_sessions for select
  using (
    exists (
      select 1
      from public.documents d
      join public.stream_members sm on sm.stream_id = d.stream_id
      where d.id = document_id
        and sm.user_id = auth.uid()
    )
  );

create policy "Authors can insert document_sessions for own documents"
  on public.document_sessions for insert
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and d.created_by = auth.uid()
    )
  );

create policy "Authors can delete document_sessions for own documents"
  on public.document_sessions for delete
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_id
        and d.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- session_relations: session ↔ related sessions (max 3 enforced in app)
-- ---------------------------------------------------------------------------
create table public.session_relations (
  session_id uuid not null references public.sessions (id) on delete cascade,
  related_session_id uuid not null references public.sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, related_session_id),
  check (session_id <> related_session_id)
);

create index session_relations_related_idx
  on public.session_relations (related_session_id);

alter table public.session_relations enable row level security;

create policy "Members can read session_relations in their streams"
  on public.session_relations for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
    )
  );

create policy "Session creators can insert session_relations"
  on public.session_relations for insert
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.created_by = auth.uid()
    )
  );

create policy "Session creators can delete session_relations"
  on public.session_relations for delete
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.created_by = auth.uid()
    )
  );

create policy "Stream admins can manage session_relations"
  on public.session_relations for all
  using (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Private docs: readable by session attendees (primary or junction) + admins
-- ---------------------------------------------------------------------------
create policy "Session attendees can read linked private documents"
  on public.documents for select
  using (
    privacy_status = 'private'
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

create policy "Stream admins can read stream documents"
  on public.documents for select
  using (
    stream_id in (
      select sm.stream_id
      from public.stream_members sm
      where sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- session_attendees: stream members can see attendance; creators can add peers
-- ---------------------------------------------------------------------------
create policy "Members can read attendance in their streams"
  on public.session_attendees for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
    )
  );

create policy "Session creators can add stream members as attendees"
  on public.session_attendees for insert
  with check (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.created_by = auth.uid()
    )
    and exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = session_attendees.user_id
    )
  );

create policy "Stream admins can add session attendees"
  on public.session_attendees for insert
  with check (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
        and sm.role = 'admin'
    )
    and exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = session_attendees.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- Member-safe peer list (any stream member, not admin-only)
-- ---------------------------------------------------------------------------
create or replace function public.list_stream_peers(p_stream_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text
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
      sm.user_id,
      au.email::text,
      coalesce(
        nullif(au.raw_user_meta_data->>'full_name', ''),
        nullif(au.raw_user_meta_data->>'name', ''),
        split_part(au.email::text, '@', 1)
      ) as display_name,
      sm.role::text
    from public.stream_members sm
    join auth.users au on au.id = sm.user_id
    where sm.stream_id = p_stream_id
    order by display_name asc;
end;
$$;

grant execute on function public.list_stream_peers(uuid) to authenticated;
