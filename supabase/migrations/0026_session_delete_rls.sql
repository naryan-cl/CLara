-- Session delete for anyone who already has edit access.
-- Mirrors UPDATE: host (created_by), stream admin, attendees, nested authors.
-- documents.session_id is ON DELETE SET NULL, so ungroup is the DB default.
-- App may delete nested documents first when the user chooses that option.

drop policy if exists "Session creators can delete their sessions"
  on public.sessions;
drop policy if exists "Stream admins can delete stream sessions"
  on public.sessions;
drop policy if exists "Session attendees can delete sessions they attended"
  on public.sessions;
drop policy if exists "Nested document authors can delete their session"
  on public.sessions;

create policy "Session creators can delete their sessions"
  on public.sessions for delete
  using (created_by = auth.uid());

create policy "Stream admins can delete stream sessions"
  on public.sessions for delete
  using (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Session attendees can delete sessions they attended"
  on public.sessions for delete
  using (
    exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = sessions.id
        and sa.user_id = auth.uid()
    )
  );

create policy "Nested document authors can delete their session"
  on public.sessions for delete
  using (
    exists (
      select 1
      from public.documents d
      where d.session_id = sessions.id
        and d.created_by = auth.uid()
    )
  );
