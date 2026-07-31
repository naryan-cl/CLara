-- Phase 5 module 4: admin polish — membership edge cases + isolation toggle.
-- prd-v0.5.md §3.2 (admin role), §4.2 (isolation) · dev-plan-v0.3.md §5 Phase 5
--
-- stream_members (0001) only ever got SELECT policies — admins had no way to
-- add/remove/promote members or flip isolation through the app, only via
-- the Supabase dashboard. This migration adds that, plus two SECURITY
-- DEFINER functions: listing members needs their email (which lives in the
-- protected auth.users table, not queryable by the authenticated role), and
-- adding a member by email needs to resolve that email to a user id the
-- same way. Both functions check the caller is an admin of the target
-- stream themselves before doing anything — the elevation is scoped
-- entirely to "admins of their own stream doing membership admin things",
-- never a blanket bypass. Do not use the app's admin (service-role) client
-- for this — this project's convention is to keep that out of
-- request-serving code paths; a scoped SECURITY DEFINER function is the
-- correct way to reach auth.users from an RLS-bound request.

-- Stream admins can add members to their own stream.
create policy "Stream admins can insert stream members"
  on public.stream_members for insert
  with check (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Stream admins can change a member's role in their own stream.
create policy "Stream admins can update stream members"
  on public.stream_members for update
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

-- Stream admins can remove members from their own stream.
create policy "Stream admins can delete stream members"
  on public.stream_members for delete
  using (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Stream admins can update their own stream's settings (isolation toggle).
create policy "Stream admins can update their stream"
  on public.streams for update
  using (
    id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- List a stream's members with email, for stream admins only.
create or replace function public.get_stream_members(p_stream_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Table alias + qualified columns throughout: this function's RETURNS
  -- TABLE names (user_id, role, ...) become plpgsql variables in scope,
  -- which collide with stream_members' own column names of the same name
  -- if referenced unqualified ("column reference is ambiguous").
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid() and sm.role = 'admin'
  ) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  return query
    select sm.user_id, au.email::text, sm.role, sm.created_at
    from public.stream_members sm
    join auth.users au on au.id = sm.user_id
    where sm.stream_id = p_stream_id
    order by sm.created_at asc;
end;
$$;

grant execute on function public.get_stream_members(uuid) to authenticated;

-- Add an existing account to a stream by email, for stream admins only.
-- Does not create accounts or send invite emails — the person must have
-- signed in with Magic Link at least once already.
create or replace function public.add_stream_member_by_email(
  p_stream_id uuid,
  p_email text,
  p_role text default 'member'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid() and sm.role = 'admin'
  ) then
    raise exception 'Not authorized: you are not an admin of this stream.';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role: %', p_role;
  end if;

  select id into v_user_id from auth.users where email = p_email;

  if v_user_id is null then
    raise exception
      'No account found for %. They need to sign in with Magic Link at least once before you can add them.',
      p_email;
  end if;

  insert into public.stream_members (stream_id, user_id, role)
  values (p_stream_id, v_user_id, p_role)
  on conflict (stream_id, user_id) do nothing;
end;
$$;

grant execute on function public.add_stream_member_by_email(uuid, text, text) to authenticated;
