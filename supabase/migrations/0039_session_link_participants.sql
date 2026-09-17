-- Named join-link participants (no account) + auto-approve signed-in guests.
--
-- Unsigned visitors open /join/{code}, enter a display name, get a device
-- token cookie, and can Reflect/Record/Upload into that session immediately.
-- Signed-in externals who use a join link are approved as session_guests
-- without an admin waiting room.
-- Apply in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Table: session_link_participants
-- ---------------------------------------------------------------------------
create table if not exists public.session_link_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  display_name text not null,
  device_token uuid not null unique default gen_random_uuid(),
  join_mode text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint session_link_participants_display_name_nonempty
    check (length(trim(display_name)) > 0)
);

create index if not exists session_link_participants_session_idx
  on public.session_link_participants (session_id);

create index if not exists session_link_participants_token_idx
  on public.session_link_participants (device_token);

comment on table public.session_link_participants is
  'Join-link guests with a display name and device token (no auth.users row).';

alter table public.session_link_participants enable row level security;

-- No anon/authenticated policies: reads/writes go through service role after
-- the app validates the httpOnly cookie.

-- ---------------------------------------------------------------------------
-- documents.guest_participant_id (attribution when created_by is null)
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists guest_participant_id uuid
    references public.session_link_participants (id) on delete set null;

create index if not exists documents_guest_participant_id_idx
  on public.documents (guest_participant_id)
  where guest_participant_id is not null;

-- ---------------------------------------------------------------------------
-- Public join lookup (no auth required)
-- ---------------------------------------------------------------------------
create or replace function public.lookup_join_session_public(p_token text)
returns table (
  session_id uuid,
  stream_id uuid,
  name text,
  join_code text,
  seed_question text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := trim(p_token);
  v_code text;
  v_uuid uuid;
begin
  if v_raw is null or length(v_raw) < 4 then
    return;
  end if;

  v_code := upper(regexp_replace(v_raw, '[^A-Z0-9]', '', 'g'));

  begin
    v_uuid := v_raw::uuid;
  exception
    when invalid_text_representation then
      v_uuid := null;
  end;

  return query
    select s.id, s.stream_id, s.name, s.join_code, s.seed_question
    from public.sessions s
    where s.deleted_at is null
      and (
        (v_uuid is not null and s.share_token = v_uuid)
        or (length(v_code) >= 4 and s.join_code = v_code)
      )
    order by
      case
        when s.stream_id in (select id from public.streams where slug = 'camp-clai')
        then 0
        else 1
      end,
      s.created_at desc
    limit 1;
end;
$$;

revoke all on function public.lookup_join_session_public(text) from public;
grant execute on function public.lookup_join_session_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Join as named link participant (returns device token)
-- ---------------------------------------------------------------------------
create or replace function public.join_as_link_participant(
  p_token text,
  p_display_name text,
  p_join_mode text default 'reflect'
)
returns table (
  participant_id uuid,
  device_token uuid,
  session_id uuid,
  session_name text,
  stream_id uuid,
  join_mode text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_mode text := coalesce(nullif(trim(p_join_mode), ''), 'reflect');
  v_name text := left(trim(coalesce(p_display_name, '')), 80);
  v_row public.session_link_participants%rowtype;
begin
  if v_name is null or length(v_name) = 0 then
    raise exception 'Display name is required.';
  end if;

  if v_mode not in ('reflect', 'record', 'upload') then
    v_mode := 'reflect';
  end if;

  select s.* into v_session
  from public.lookup_join_session_public(p_token) looked
  join public.sessions s on s.id = looked.session_id;

  if v_session.id is null then
    return;
  end if;

  insert into public.session_link_participants (
    session_id, display_name, join_mode
  )
  values (v_session.id, v_name, v_mode)
  returning * into v_row;

  return query select
    v_row.id,
    v_row.device_token,
    v_session.id,
    v_session.name,
    v_session.stream_id,
    v_mode,
    v_row.display_name;
end;
$$;

revoke all on function public.join_as_link_participant(text, text, text) from public;
grant execute on function public.join_as_link_participant(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auto-approve signed-in join-link guests (no waiting room)
-- ---------------------------------------------------------------------------
create or replace function public.request_session_guest_access(
  p_token text,
  p_join_mode text default 'reflect'
)
returns table (
  outcome text,
  session_id uuid,
  session_name text,
  stream_id uuid,
  join_mode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_mode text := coalesce(nullif(trim(p_join_mode), ''), 'reflect');
  v_row public.session_guests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if v_mode not in ('reflect', 'record', 'upload') then
    v_mode := 'reflect';
  end if;

  select s.* into v_session
  from public.lookup_join_session(p_token) looked
  join public.sessions s on s.id = looked.session_id;

  if v_session.id is null then
    return query select 'not_found'::text, null::uuid, null::text, null::uuid, v_mode;
    return;
  end if;

  if exists (
    select 1
    from public.stream_members sm
    where sm.stream_id = v_session.stream_id
      and sm.user_id = auth.uid()
  ) then
    return query select
      'member'::text,
      v_session.id,
      v_session.name,
      v_session.stream_id,
      v_mode;
    return;
  end if;

  select * into v_row
  from public.session_guests sg
  where sg.session_id = v_session.id
    and sg.user_id = auth.uid();

  if v_row.user_id is not null and v_row.status = 'approved' then
    return query select
      'approved'::text,
      v_session.id,
      v_session.name,
      v_session.stream_id,
      coalesce(v_row.join_mode, v_mode);
    return;
  end if;

  insert into public.session_guests (
    session_id, user_id, status, source, join_mode, session_name,
    reviewed_at
  )
  values (
    v_session.id, auth.uid(), 'approved', 'join_link', v_mode, v_session.name,
    now()
  )
  on conflict (session_id, user_id) do update
    set status = 'approved',
        join_mode = excluded.join_mode,
        session_name = excluded.session_name,
        reviewed_at = coalesce(public.session_guests.reviewed_at, now()),
        reviewed_by = public.session_guests.reviewed_by;

  select * into v_row
  from public.session_guests sg
  where sg.session_id = v_session.id
    and sg.user_id = auth.uid();

  return query select
    'approved'::text,
    v_session.id,
    v_session.name,
    v_session.stream_id,
    v_mode;
end;
$$;

revoke all on function public.request_session_guest_access(text, text) from public, anon;
grant execute on function public.request_session_guest_access(text, text) to authenticated;

comment on table public.session_guests is
  'External join-link access. New join-link requests are auto-approved; legacy pending rows may still exist.';
