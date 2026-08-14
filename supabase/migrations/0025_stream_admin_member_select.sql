-- Stream admins could not promote/demote/remove other members.
-- Why: Postgres RLS skips UPDATE/DELETE on rows the caller cannot SELECT.
-- 0001 only allowed SELECT of your own stream_members row, so "Make admin"
-- returned success with 0 rows changed. A SECURITY DEFINER helper avoids
-- infinite recursion (a SELECT policy must not query stream_members under RLS).
--
-- Apply in the Supabase SQL editor. Safe to re-run.

create or replace function public.is_stream_admin(p_stream_id uuid)
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
      and sm.role = 'admin'
  );
$$;

revoke all on function public.is_stream_admin(uuid) from public;
revoke all on function public.is_stream_admin(uuid) from anon;
grant execute on function public.is_stream_admin(uuid) to authenticated;

drop policy if exists "Stream admins can view members of their streams"
  on public.stream_members;

create policy "Stream admins can view members of their streams"
  on public.stream_members for select
  using (public.is_stream_admin(stream_id));
