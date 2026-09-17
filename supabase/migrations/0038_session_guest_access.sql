-- Session-scoped guests + CL-domain auto-join.
--
-- @cultivatingleadership.com (and stream allowlist emails) still become
-- Camp CLAI members on signup. Every other account must be approved:
--   • Session join link → pending session guest → admin approves →
--     that gathering only (not the rest of the Commons).
--   • Admin "Add member" / allowlist → full stream membership (exception).
-- Existing stream_members rows are not revoked.
-- Apply in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.stream_access_allowlist (
  stream_id uuid not null references public.streams (id) on delete cascade,
  email text not null,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (stream_id, email)
);

create index if not exists stream_access_allowlist_email_idx
  on public.stream_access_allowlist (lower(email));

comment on table public.stream_access_allowlist is
  'Emails that become full stream members on signup (admin exception list).';

alter table public.stream_access_allowlist enable row level security;

create table if not exists public.session_guests (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'join_link',
  join_mode text,
  session_name text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  primary key (session_id, user_id)
);

create index if not exists session_guests_user_status_idx
  on public.session_guests (user_id, status);

create index if not exists session_guests_session_status_idx
  on public.session_guests (session_id, status);

comment on table public.session_guests is
  'External join-link access: pending until a stream admin approves. Approved guests see only that session.';

alter table public.session_guests enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER — avoid RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(p_email));
$$;

create or replace function public.email_domain(p_email text)
returns text
language sql
immutable
as $$
  select lower(split_part(trim(p_email), '@', 2));
$$;

create or replace function public.is_cl_email(p_email text)
returns boolean
language sql
immutable
as $$
  select public.email_domain(p_email) = 'cultivatingleadership.com';
$$;

create or replace function public.is_stream_member(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stream_members sm
    where sm.stream_id = p_stream_id
      and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_approved_session_guest(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_guests sg
    where sg.session_id = p_session_id
      and sg.user_id = auth.uid()
      and sg.status = 'approved'
  );
$$;

create or replace function public.is_guest_of_stream(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_guests sg
    join public.sessions s on s.id = sg.session_id
    where sg.user_id = auth.uid()
      and sg.status = 'approved'
      and s.stream_id = p_stream_id
      and s.deleted_at is null
  );
$$;

create or replace function public.is_stream_member_of_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    join public.stream_members sm on sm.stream_id = s.stream_id
    where s.id = p_session_id
      and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_document_in_guest_session(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.deleted_at is null
      and (
        (
          d.session_id is not null
          and exists (
            select 1
            from public.session_guests sg
            where sg.session_id = d.session_id
              and sg.user_id = auth.uid()
              and sg.status = 'approved'
          )
        )
        or exists (
          select 1
          from public.document_sessions ds
          join public.session_guests sg on sg.session_id = ds.session_id
          where ds.document_id = d.id
            and sg.user_id = auth.uid()
            and sg.status = 'approved'
        )
      )
  );
$$;

create or replace function public.can_use_stream_storage(p_stream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_stream_member(p_stream_id)
    or public.is_guest_of_stream(p_stream_id);
$$;

revoke all on function public.normalize_email(text) from public;
revoke all on function public.email_domain(text) from public;
revoke all on function public.is_cl_email(text) from public;
grant execute on function public.normalize_email(text) to authenticated;
grant execute on function public.email_domain(text) to authenticated;
grant execute on function public.is_cl_email(text) to authenticated;

revoke all on function public.is_stream_member(uuid) from public, anon;
revoke all on function public.is_approved_session_guest(uuid) from public, anon;
revoke all on function public.is_guest_of_stream(uuid) from public, anon;
revoke all on function public.is_stream_member_of_session(uuid) from public, anon;
revoke all on function public.is_document_in_guest_session(uuid) from public, anon;
revoke all on function public.can_use_stream_storage(uuid) from public, anon;
grant execute on function public.is_stream_member(uuid) to authenticated;
grant execute on function public.is_approved_session_guest(uuid) to authenticated;
grant execute on function public.is_guest_of_stream(uuid) to authenticated;
grant execute on function public.is_stream_member_of_session(uuid) to authenticated;
grant execute on function public.is_document_in_guest_session(uuid) to authenticated;
grant execute on function public.can_use_stream_storage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup: CL domain + allowlist only (replaces blanket Camp CLAI auto-join)
-- ---------------------------------------------------------------------------
create or replace function public.apply_signup_stream_access(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_email is null or trim(p_email) = '' then
    return;
  end if;

  if public.is_cl_email(p_email) then
    insert into public.stream_members (stream_id, user_id, role)
    select s.id, p_user_id, 'member'
    from public.streams s
    where s.slug = 'camp-clai'
    on conflict (stream_id, user_id) do nothing;
  end if;

  insert into public.stream_members (stream_id, user_id, role)
  select a.stream_id, p_user_id, 'member'
  from public.stream_access_allowlist a
  where a.email = public.normalize_email(p_email)
  on conflict (stream_id, user_id) do nothing;
end;
$$;

revoke all on function public.apply_signup_stream_access(uuid, text) from public, anon, authenticated;

create or replace function public.add_user_to_camp_clai(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email::text into v_email from auth.users where id = p_user_id;
  perform public.apply_signup_stream_access(p_user_id, v_email);
end;
$$;

create or replace function public.handle_new_user_camp_clai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_signup_stream_access(new.id, new.email);
  return new;
exception
  when others then
    raise warning 'handle_new_user_camp_clai: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.ensure_my_camp_clai_membership()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  select email::text into v_email from auth.users where id = auth.uid();
  perform public.apply_signup_stream_access(auth.uid(), v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- Join lookup + guest request / review (no membership required to look up)
-- ---------------------------------------------------------------------------
create or replace function public.lookup_join_session(p_token text)
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
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
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

revoke all on function public.lookup_join_session(text) from public, anon;
grant execute on function public.lookup_join_session(text) to authenticated;

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
    session_id, user_id, status, source, join_mode, session_name
  )
  values (
    v_session.id, auth.uid(), 'pending', 'join_link', v_mode, v_session.name
  )
  on conflict (session_id, user_id) do update
    set status = case
          when public.session_guests.status = 'approved' then 'approved'
          else 'pending'
        end,
        join_mode = excluded.join_mode,
        session_name = excluded.session_name,
        reviewed_at = case
          when public.session_guests.status = 'approved' then public.session_guests.reviewed_at
          else null
        end,
        reviewed_by = case
          when public.session_guests.status = 'approved' then public.session_guests.reviewed_by
          else null
        end;

  select * into v_row
  from public.session_guests sg
  where sg.session_id = v_session.id
    and sg.user_id = auth.uid();

  return query select
    v_row.status::text,
    v_session.id,
    v_session.name,
    v_session.stream_id,
    v_mode;
end;
$$;

revoke all on function public.request_session_guest_access(text, text) from public, anon;
grant execute on function public.request_session_guest_access(text, text) to authenticated;

create or replace function public.list_stream_guest_requests(p_stream_id uuid)
returns table (
  session_id uuid,
  session_name text,
  user_id uuid,
  email text,
  status text,
  source text,
  join_mode text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_stream_admin(p_stream_id) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  return query
    select
      sg.session_id,
      coalesce(sg.session_name, s.name) as session_name,
      sg.user_id,
      au.email::text,
      sg.status,
      sg.source,
      sg.join_mode,
      sg.created_at,
      sg.reviewed_at
    from public.session_guests sg
    join public.sessions s on s.id = sg.session_id
    join auth.users au on au.id = sg.user_id
    where s.stream_id = p_stream_id
    order by
      case sg.status when 'pending' then 0 when 'approved' then 1 else 2 end,
      sg.created_at desc;
end;
$$;

revoke all on function public.list_stream_guest_requests(uuid) from public, anon;
grant execute on function public.list_stream_guest_requests(uuid) to authenticated;

create or replace function public.review_session_guest_request(
  p_session_id uuid,
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stream_id uuid;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select s.stream_id into v_stream_id
  from public.sessions s
  where s.id = p_session_id;

  if v_stream_id is null then
    raise exception 'Session not found.';
  end if;

  if not public.is_stream_admin(v_stream_id) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  update public.session_guests
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where session_id = p_session_id
    and user_id = p_user_id;

  if not found then
    raise exception 'No guest request found for that person.';
  end if;
end;
$$;

revoke all on function public.review_session_guest_request(uuid, uuid, text) from public, anon;
grant execute on function public.review_session_guest_request(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite-or-add full stream members (admin exception / allowlist)
-- ---------------------------------------------------------------------------
drop function if exists public.add_stream_member_by_email(uuid, text, text);

create or replace function public.invite_or_add_stream_member(
  p_stream_id uuid,
  p_email text,
  p_role text default 'member'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text := public.normalize_email(p_email);
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id
      and sm.user_id = auth.uid()
      and sm.role = 'admin'
  ) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if v_email is null or v_email = '' or v_email not like '%@%' then
    raise exception 'Enter a valid email address.';
  end if;

  select id into v_user_id from auth.users where lower(email) = v_email;

  if v_user_id is not null then
    insert into public.stream_members (stream_id, user_id, role)
    values (p_stream_id, v_user_id, p_role)
    on conflict (stream_id, user_id) do nothing;

    delete from public.stream_access_allowlist
    where stream_id = p_stream_id and email = v_email;

    return 'added';
  end if;

  insert into public.stream_access_allowlist (stream_id, email, added_by)
  values (p_stream_id, v_email, auth.uid())
  on conflict (stream_id, email) do nothing;

  return 'invited';
end;
$$;

revoke all on function public.invite_or_add_stream_member(uuid, text, text) from public, anon;
grant execute on function public.invite_or_add_stream_member(uuid, text, text) to authenticated;

create or replace function public.list_stream_allowlist(p_stream_id uuid)
returns table (
  email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_stream_admin(p_stream_id) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  return query
    select a.email, a.created_at
    from public.stream_access_allowlist a
    where a.stream_id = p_stream_id
    order by a.created_at asc;
end;
$$;

revoke all on function public.list_stream_allowlist(uuid) from public, anon;
grant execute on function public.list_stream_allowlist(uuid) to authenticated;

create or replace function public.remove_stream_allowlist_email(
  p_stream_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_stream_admin(p_stream_id) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  delete from public.stream_access_allowlist
  where stream_id = p_stream_id
    and email = public.normalize_email(p_email);
end;
$$;

revoke all on function public.remove_stream_allowlist_email(uuid, text) from public, anon;
grant execute on function public.remove_stream_allowlist_email(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: session_guests + allowlist
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view their own guest rows" on public.session_guests;
create policy "Users can view their own guest rows"
  on public.session_guests for select
  using (user_id = auth.uid());

drop policy if exists "Stream admins can view guest rows" on public.session_guests;
create policy "Stream admins can view guest rows"
  on public.session_guests for select
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and public.is_stream_admin(s.stream_id)
    )
  );

drop policy if exists "Stream admins can view allowlist" on public.stream_access_allowlist;
create policy "Stream admins can view allowlist"
  on public.stream_access_allowlist for select
  using (public.is_stream_admin(stream_id));

-- ---------------------------------------------------------------------------
-- RLS: streams / sessions / documents for approved guests
-- ---------------------------------------------------------------------------
drop policy if exists "Session guests can view streams they have access to"
  on public.streams;
create policy "Session guests can view streams they have access to"
  on public.streams for select
  using (public.is_guest_of_stream(id));

drop policy if exists "Session guests can read their sessions"
  on public.sessions;
create policy "Session guests can read their sessions"
  on public.sessions for select
  using (
    deleted_at is null
    and public.is_approved_session_guest(id)
  );

drop policy if exists "Session guests can read public documents in their sessions"
  on public.documents;
create policy "Session guests can read public documents in their sessions"
  on public.documents for select
  using (
    deleted_at is null
    and privacy_status = 'public'
    and public.is_document_in_guest_session(id)
  );

drop policy if exists "Session guests can read private documents in their sessions"
  on public.documents;
create policy "Session guests can read private documents in their sessions"
  on public.documents for select
  using (
    deleted_at is null
    and privacy_status = 'private'
    and public.is_document_in_guest_session(id)
    and (
      created_by = auth.uid()
      or exists (
        select 1
        from public.session_attendees sa
        where sa.user_id = auth.uid()
          and (
            sa.session_id = documents.session_id
            or exists (
              select 1
              from public.document_sessions ds
              where ds.document_id = documents.id
                and ds.session_id = sa.session_id
            )
          )
      )
    )
  );

drop policy if exists "Session guests can insert documents in their sessions"
  on public.documents;
create policy "Session guests can insert documents in their sessions"
  on public.documents for insert
  with check (
    created_by = auth.uid()
    and session_id is not null
    and public.is_approved_session_guest(session_id)
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.stream_id = stream_id
        and s.deleted_at is null
    )
  );

-- Optional tables (0011 comments, 0012 document_sessions). DROP POLICY IF EXISTS
-- still errors when the *table* is missing — Postgres only treats the policy
-- name as optional. Skip those policies when the relation is not there.
do $$
begin
  if to_regclass('public.document_sessions') is not null then
    drop policy if exists "Session guests can read document_sessions for their sessions"
      on public.document_sessions;
    create policy "Session guests can read document_sessions for their sessions"
      on public.document_sessions for select
      using (public.is_approved_session_guest(session_id));

    drop policy if exists "Authors can insert document_sessions for own documents"
      on public.document_sessions;
    create policy "Authors can insert document_sessions for own documents"
      on public.document_sessions for insert
      with check (
        public.is_document_author(document_id)
        and (
          public.is_stream_member_of_session(session_id)
          or public.is_approved_session_guest(session_id)
        )
      );
  end if;

  if to_regclass('public.session_attendees') is not null then
    drop policy if exists "Session guests can mark themselves attended"
      on public.session_attendees;
    create policy "Session guests can mark themselves attended"
      on public.session_attendees for insert
      with check (
        user_id = auth.uid()
        and public.is_approved_session_guest(session_id)
      );

    drop policy if exists "Session guests can read attendance in their sessions"
      on public.session_attendees;
    create policy "Session guests can read attendance in their sessions"
      on public.session_attendees for select
      using (public.is_approved_session_guest(session_id));
  end if;

  if to_regclass('public.comments') is not null then
    drop policy if exists "Session guests can read comments in their sessions"
      on public.comments;
    create policy "Session guests can read comments in their sessions"
      on public.comments for select
      using (
        (
          target_type = 'session'
          and public.is_approved_session_guest(target_id)
        )
        or (
          target_type = 'document'
          and public.is_document_in_guest_session(target_id)
        )
      );

    drop policy if exists "Session guests can insert comments in their sessions"
      on public.comments;
    create policy "Session guests can insert comments in their sessions"
      on public.comments for insert
      with check (
        author_id = auth.uid()
        and (
          (
            target_type = 'session'
            and public.is_approved_session_guest(target_id)
          )
          or (
            target_type = 'document'
            and public.is_document_in_guest_session(target_id)
          )
        )
      );
  end if;
end;
$$;

-- Storage: approved guests of any session in the stream may upload Record/Upload audio.
drop policy if exists "Members can upload to their stream's listens staging path"
  on storage.objects;
create policy "Members can upload to their stream's listens staging path"
  on storage.objects for insert
  with check (
    bucket_id = 'listens-staging'
    and public.can_use_stream_storage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Members can read their stream's listens staging objects"
  on storage.objects;
create policy "Members can read their stream's listens staging objects"
  on storage.objects for select
  using (
    bucket_id = 'listens-staging'
    and public.can_use_stream_storage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Members can delete their stream's listens staging objects"
  on storage.objects;
create policy "Members can delete their stream's listens staging objects"
  on storage.objects for delete
  using (
    bucket_id = 'listens-staging'
    and public.can_use_stream_storage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Members can upload to their stream's staging path"
  on storage.objects;
create policy "Members can upload to their stream's staging path"
  on storage.objects for insert
  with check (
    bucket_id = 'receives-staging'
    and public.can_use_stream_storage((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Members can read their stream's staging objects"
  on storage.objects;
create policy "Members can read their stream's staging objects"
  on storage.objects for select
  using (
    bucket_id = 'receives-staging'
    and public.can_use_stream_storage((storage.foldername(name))[1]::uuid)
  );

-- Display names: guests may see stream members + fellow guests of their sessions.
create or replace function public.get_user_public_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  return query
    select
      au.id as user_id,
      au.email::text,
      coalesce(
        nullif(au.raw_user_meta_data->>'full_name', ''),
        nullif(au.raw_user_meta_data->>'name', ''),
        nullif(au.raw_user_meta_data->>'display_name', ''),
        nullif(trim(concat_ws(' ',
          au.raw_user_meta_data->>'given_name',
          au.raw_user_meta_data->>'family_name'
        )), ''),
        nullif(split_part(au.email::text, '@', 1), '')
      ) as display_name,
      coalesce(
        nullif(au.raw_user_meta_data->>'avatar_url', ''),
        nullif(au.raw_user_meta_data->>'picture', '')
      ) as avatar_url
    from auth.users au
    where au.id = any (p_user_ids)
      and (
        au.id = auth.uid()
        or exists (
          select 1
          from public.stream_members caller
          join public.stream_members target
            on target.stream_id = caller.stream_id
          where caller.user_id = auth.uid()
            and target.user_id = au.id
        )
        or exists (
          select 1
          from public.session_guests sg
          join public.sessions s on s.id = sg.session_id
          join public.stream_members sm on sm.stream_id = s.stream_id
          where sg.user_id = auth.uid()
            and sg.status = 'approved'
            and sm.user_id = au.id
        )
        or exists (
          select 1
          from public.session_guests me
          join public.session_guests them on them.session_id = me.session_id
          where me.user_id = auth.uid()
            and me.status = 'approved'
            and them.user_id = au.id
            and them.status = 'approved'
        )
      );
end;
$$;

grant execute on function public.get_user_public_profiles(uuid[]) to authenticated;
