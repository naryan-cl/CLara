-- Let session editors remove Relate rows that point *at* their gathering.
-- Without this, editing session B cannot delete A→B links stored on A's row,
-- so map lines linger after the host unchecks the connection on B.

create policy "Session editors can delete incoming session_relations"
  on public.session_relations for delete
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_relations.related_session_id
        and (
          s.created_by = auth.uid()
          or public.is_stream_admin(s.stream_id)
          or exists (
            select 1
            from public.session_attendees sa
            where sa.session_id = s.id
              and sa.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.documents d
            where d.session_id = s.id
              and d.created_by = auth.uid()
          )
        )
    )
  );
