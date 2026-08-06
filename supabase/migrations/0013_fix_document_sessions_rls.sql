-- Fix infinite recursion between documents ↔ document_sessions RLS.
-- 0012's document_sessions SELECT policy queried documents, while documents'
-- private-attendee SELECT policy queried document_sessions.
-- Also tighten attendee INSERT WITH CHECK to use the new-row user_id column.

-- ---------------------------------------------------------------------------
-- document_sessions: break the cycle (authorize via sessions, not documents)
-- ---------------------------------------------------------------------------
drop policy if exists "Members can read document_sessions in their streams"
  on public.document_sessions;
drop policy if exists "Authors can insert document_sessions for own documents"
  on public.document_sessions;
drop policy if exists "Authors can delete document_sessions for own documents"
  on public.document_sessions;

-- SELECT: stream membership through the linked session (never touch documents).
create policy "Members can read document_sessions in their streams"
  on public.document_sessions for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where s.id = session_id
        and sm.user_id = auth.uid()
    )
  );

-- Ownership check via SECURITY DEFINER so INSERT/DELETE don't re-enter
-- documents RLS (which itself may inspect document_sessions).
create or replace function public.is_document_author(p_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.created_by = auth.uid()
  );
$$;

revoke all on function public.is_document_author(uuid) from public;
grant execute on function public.is_document_author(uuid) to authenticated;

create policy "Authors can insert document_sessions for own documents"
  on public.document_sessions for insert
  with check (public.is_document_author(document_id));

create policy "Authors can delete document_sessions for own documents"
  on public.document_sessions for delete
  using (public.is_document_author(document_id));

-- ---------------------------------------------------------------------------
-- session_attendees INSERT: qualify new-row user_id clearly
-- ---------------------------------------------------------------------------
drop policy if exists "Session creators can add stream members as attendees"
  on public.session_attendees;
drop policy if exists "Stream admins can add session attendees"
  on public.session_attendees;

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
        and sm.user_id = user_id
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
        and sm.user_id = user_id
    )
  );
