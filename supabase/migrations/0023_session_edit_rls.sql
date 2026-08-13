-- Session metadata edit: attendees + authors of nested documents.
-- Host (created_by) and stream admins already have UPDATE from 0004 / 0012.
-- Why: OKF-created sessions often have created_by null, so the uploader
-- could not rename a gathering that used a UUID as its title.

drop policy if exists "Session attendees can update sessions they attended"
  on public.sessions;
drop policy if exists "Nested document authors can update their session"
  on public.sessions;

create policy "Session attendees can update sessions they attended"
  on public.sessions for update
  using (
    exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = sessions.id
        and sa.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = sessions.id
        and sa.user_id = auth.uid()
    )
  );

create policy "Nested document authors can update their session"
  on public.sessions for update
  using (
    exists (
      select 1
      from public.documents d
      where d.session_id = sessions.id
        and d.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      where d.session_id = sessions.id
        and d.created_by = auth.uid()
    )
  );
