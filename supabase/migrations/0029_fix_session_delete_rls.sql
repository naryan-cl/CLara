-- Break infinite recursion on sessions DELETE (and the same cycle on UPDATE).
--
-- 0023 / 0026 policies queried session_attendees and documents under RLS.
-- Those tables' policies query sessions again:
--   sessions → session_attendees → sessions
--   sessions → documents → session_attendees → sessions
-- Postgres then raises: infinite recursion detected in policy for relation "sessions".
--
-- Same pattern as 0013 (documents ↔ document_sessions) and 0025 (is_stream_admin):
-- SECURITY DEFINER helpers bypass RLS for the existence check only.
--
-- Apply in the Supabase SQL editor. Safe to re-run.

create or replace function public.is_session_attendee(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_attendees sa
    where sa.session_id = p_session_id
      and sa.user_id = auth.uid()
  );
$$;

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
  );
$$;

revoke all on function public.is_session_attendee(uuid) from public;
revoke all on function public.is_session_attendee(uuid) from anon;
grant execute on function public.is_session_attendee(uuid) to authenticated;

revoke all on function public.is_nested_session_document_author(uuid) from public;
revoke all on function public.is_nested_session_document_author(uuid) from anon;
grant execute on function public.is_nested_session_document_author(uuid) to authenticated;

-- UPDATE (0023) — same cycle as DELETE
drop policy if exists "Session attendees can update sessions they attended"
  on public.sessions;
drop policy if exists "Nested document authors can update their session"
  on public.sessions;

create policy "Session attendees can update sessions they attended"
  on public.sessions for update
  using (public.is_session_attendee(id))
  with check (public.is_session_attendee(id));

create policy "Nested document authors can update their session"
  on public.sessions for update
  using (public.is_nested_session_document_author(id))
  with check (public.is_nested_session_document_author(id));

-- DELETE (0026)
drop policy if exists "Session attendees can delete sessions they attended"
  on public.sessions;
drop policy if exists "Nested document authors can delete their session"
  on public.sessions;

create policy "Session attendees can delete sessions they attended"
  on public.sessions for delete
  using (public.is_session_attendee(id));

create policy "Nested document authors can delete their session"
  on public.sessions for delete
  using (public.is_nested_session_document_author(id));
